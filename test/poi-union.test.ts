import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CATEGORIES } from "../src/amap/categories.js";
import { AdmissionError } from "../src/admission/errors.js";
import { createAdmission, type PostgresAdmissionStore } from "../src/admission/service.js";
import { AmapApiError } from "../src/amap/errors.js";
import { buildUrl, MAX_CALLS, parseConfig, plan, statistics, SYNTHETIC_CONFIG } from "../scripts/experiments/poi-union/model.js";
import { runExperiment, type Runtime } from "../scripts/experiments/poi-union/runner.js";
import { markdown, publicReport, type Report } from "../scripts/experiments/poi-union/report.js";
import { claimLiveBudget, reportWriter } from "../scripts/experiments/poi-union/storage.js";
import { parseArgs } from "../scripts/experiments/poi-union/cli.js";

const config = SYNTHETIC_CONFIG;
const noop = () => {};
function runtime(overrides: Partial<Runtime> = {}): Runtime {
  return { key: "test-key-private", beforeAttempt: async () => ({ assertValid() {} }), fetchImpl: async () => Response.json({ status: "1", infocode: "10000", pois: [] }), ...overrides };
}
function mock(overrides: Partial<Runtime>, checkpoint: (r: Report) => void = noop, signal?: AbortSignal) {
  return runExperiment({ mode: "mock", config, checkpoint, createRuntime: async () => runtime(overrides), ...(signal ? { signal } : {}) });
}

test("union dry run never constructs runtime, calls network or admission", async () => {
  const report = await runExperiment({ mode: "dry", config, checkpoint: noop, createRuntime: async () => { throw new Error("must not run"); } });
  assert.equal(report.results.length, 9);
  assert.equal(report.httpCalls + report.simulatedCalls, 0);
  assert.ok(report.results.every(r => r.outcome === "planned" && r.stats === null && r.admission === "not-attempted"));
});

test("union plans exactly three distinct sites and nested 3/5/10 configured categories", () => {
  const trials = plan(config);
  assert.equal(trials.length, MAX_CALLS);
  for (let i = 0; i < 9; i += 3) {
    const [a, b, c] = trials.slice(i, i + 3);
    assert.deepEqual([a!.categories.length, b!.categories.length, c!.categories.length], [3, 5, 10]);
    assert.ok(a!.categories.every(k => b!.categories.includes(k)) && b!.categories.every(k => c!.categories.includes(k)));
  }
  for (const invalid of [{ ...config, locations: [...config.locations, config.locations[0]] }, { ...config, radiusMeters: 0 }, { ...config, locations: config.locations.map(s => ({ ...s, longitude: null })) }, { ...config, locations: config.locations.map(() => config.locations[0]) }]) assert.throws(() => parseConfig(invalid));
});

test("union URL uses pipe-separated configured codes and fixed first-page parameters", () => {
  for (const trial of plan(config)) {
    const url = buildUrl("private", config.locations[0]!, config.radiusMeters, trial);
    assert.equal(url.pathname, "/v5/place/around");
    assert.equal(url.searchParams.get("types"), trial.categories.flatMap(k => CATEGORIES.find(c => c.key === k)!.types).join("|"));
    for (const [k, v] of Object.entries({ page_size: "25", page_num: "1", sortrule: "distance", radius: "1000", show_fields: "business" })) assert.equal(url.searchParams.get(k), v);
    assert.equal(url.searchParams.has("keywords"), false);
  }
});

test("union mock completes all scales through transport with exactly nine simulated sends", async () => {
  const report = await runExperiment({ mode: "mock", config, checkpoint: noop });
  assert.equal(report.state, "completed"); assert.equal(report.results.length, 9);
  assert.equal(report.httpCalls, 0); assert.equal(report.simulatedCalls, 9);
  assert.ok(report.results.every(r => r.httpCalls === 0 && r.simulatedCalls === 1 && r.outcome === "success" && r.httpStatus === 200 && r.businessStatus === "1"));
  assert.ok(report.results.some(r => r.stats?.reachedPageCap));
});

test("union mixed POIs are counted by exact configured code, not assigned to the entire query", () => {
  const stats = statistics({ pois: [{ typecode: "100100" }, { typecode: "060100" }, { typecode: "050117" }, { typecode: "050117" }, { typecode: "080111" }] });
  assert.deepEqual([stats.perCategory.hotel, stats.perCategory.mall, stats.perCategory.hotpot, stats.perCategory.gym], [1, 1, 2, 1]);
  assert.equal(stats.perCategory.bus, 0); assert.equal(stats.unconfirmedCount, 0);
});

test("union unknown and child codes remain unconfirmed, parent and child counts stay separate", () => {
  const stats = statistics({ pois: [{ typecode: "150700" }, { typecode: "150701" }, { typecode: "150501" }, { typecode: "100101" }, { typecode: "999999" }] });
  assert.equal(stats.perCategory.bus, 1); assert.equal(stats.perCategory.subway, 0); assert.equal(stats.perCategory.hotel, 0);
  assert.equal(stats.unconfirmedCount, 4);
  assert.deepEqual(stats.unconfirmedTypecodes, { "150701": 1, "150501": 1, "100101": 1, "999999": 1 });
  assert.equal(stats.rawTypecodes["150700"], 1); assert.equal(stats.rawTypecodes["150701"], 1);
});

test("union empty/missing/malformed POIs and missing codes are handled without unsafe fields", () => {
  assert.equal(statistics({ pois: [] }).returnedPois, 0);
  for (const pois of [undefined, null, {}, "bad", Array(26).fill({})]) assert.throws(() => statistics({ pois }), (e: unknown) => e instanceof AmapApiError && e.code === "UPSTREAM_INVALID_PAYLOAD");
  const stats = statistics({ pois: [null, 1, {}, { typecode: "arbitrary private text" }, { typecode: ["100100"] }] });
  assert.equal(stats.returnedPois, 5); assert.equal(stats.invalidItems, 2); assert.equal(stats.unconfirmedCount, 5);
  assert.deepEqual(stats.rawTypecodes, { "<missing>": 3, "<invalid>": 2 });
});

test("union successful business status and infocode survive later POI schema failure", async () => {
  const report = await mock({ fetchImpl: async () => Response.json({ status: "1", infocode: "10000", pois: {} }) });
  assert.equal(report.results[0]!.httpStatus, 200); assert.equal(report.results[0]!.businessStatus, "1");
  assert.equal(report.results[0]!.infocode, "10000"); assert.equal(report.results[0]!.errorCode, "UPSTREAM_INVALID_PAYLOAD");
});

test("union admission failure stops before the next HTTP and checkpoints completed results", async () => {
  let grants = 0, sends = 0;
  const snapshots: unknown[] = [];
  const report = await mock({ beforeAttempt: async () => { if (++grants === 3) throw new AdmissionError("DAILY_BUDGET_EXHAUSTED"); return { assertValid() {} }; }, fetchImpl: async () => { sends++; return Response.json({ status: "1", pois: [{ typecode: "100100" }] }); } }, r => snapshots.push(publicReport(r)));
  assert.equal(sends, 2); assert.equal(grants, 3); assert.equal(report.state, "stopped");
  assert.equal(report.results[2]!.admission, "failed"); assert.equal(report.results[2]!.httpCalls + report.results[2]!.simulatedCalls, 0);
  assert.equal(report.skippedTrials, 6); assert.equal(report.results[0]!.stats!.perCategory.hotel, 1);
  assert.ok(snapshots.length >= 4);
});

test("union real admission service reserve/grant/permit are used before transport send", async () => {
  const events: string[] = [];
  const store = { async reserve() { events.push("reserve"); return { resourceId: "test", version: 1, scheduledAt: new Date(), expiresAt: new Date(Date.now() + 1000), delayMs: 0, validForMs: 1000 }; }, async grant() { events.push("grant"); return { validForMs: 900 }; } } as unknown as PostgresAdmissionStore;
  const report = await mock({ beforeAttempt: createAdmission(store, "test"), fetchImpl: async () => { events.push("send"); return Response.json({ status: "1", pois: [] }); } });
  assert.equal(report.state, "completed"); assert.deepEqual(events, Array.from({ length: 9 }, () => ["reserve", "grant", "send"]).flat());
});

test("union expired final permit prevents send and stops", async () => {
  let sends = 0;
  const report = await mock({ beforeAttempt: async () => ({ assertValid() { throw new AdmissionError("ADMISSION_WAIT_EXCEEDED"); } }), fetchImpl: async () => { sends++; return Response.json({}); } });
  assert.equal(sends, 0); assert.equal(report.results.length, 1); assert.equal(report.results[0]!.admission, "failed");
});

test("union admission hook without a final permit fails closed", async () => {
  let sends = 0;
  const report = await mock({ beforeAttempt: async () => {}, fetchImpl: async () => { sends++; return Response.json({}); } });
  assert.equal(sends, 0); assert.equal(report.results[0]!.errorCode, "ADMISSION_UNAVAILABLE");
});

test("union timeout of an uncooperative upstream is bounded and never retried", async () => {
  let sends = 0;
  const report = await mock({ policy: { upstreamTimeoutMs: 10, maxResponseBytes: 1024 }, fetchImpl: async () => { sends++; return new Promise<Response>(() => {}); } });
  assert.equal(sends, 1); assert.equal(report.results[0]!.errorCode, "UPSTREAM_TIMEOUT"); assert.equal(report.state, "stopped");
});

test("union failures never trigger retry, pagination, geocode or further trials", async () => {
  const responses = [() => new Response("bad", { status: 503 }), () => new Response("not json"), () => Response.json({ status: "0", infocode: "10009", info: "private" }), () => Response.json({ status: "1" }), () => Response.json({ status: "1", pois: [] })];
  for (const [i, response] of responses.entries()) {
    const urls: URL[] = [];
    const report = await mock({ fetchImpl: async input => { urls.push(new URL(String(input))); return response(); } });
    assert.equal(urls.length, i === responses.length - 1 ? 9 : 1);
    assert.ok(urls.every(u => u.pathname === "/v5/place/around" && u.searchParams.get("page_num") === "1"));
    if (i === 0) assert.equal(report.results[0]!.httpStatus, 503);
    if (i === 2) { assert.equal(report.results[0]!.businessStatus, "non-success"); assert.equal(report.results[0]!.infocode, "10009"); }
  }
});

test("union interrupted request saves earlier statistics and stops subsequent sends", async () => {
  const controller = new AbortController(); let calls = 0;
  const report = await mock({ fetchImpl: async () => { if (++calls === 2) { controller.abort(); throw new Error("private cancellation text"); } return Response.json({ status: "1", pois: [{ typecode: "100100" }] }); } }, noop, controller.signal);
  assert.equal(calls, 2); assert.equal(report.results[0]!.stats!.returnedPois, 1); assert.equal(report.results[1]!.errorCode, "REQUEST_CANCELLED"); assert.equal(report.state, "stopped");
});

test("union durable report survives mid-run error and storage failure prevents HTTP", async () => {
  const directory = mkdtempSync(join(tmpdir(), "poi-union-report-"));
  try {
    let calls = 0;
    await mock({ fetchImpl: async () => { if (++calls === 3) throw new Error("private network failure"); return Response.json({ status: "1", pois: [] }); } }, reportWriter(directory));
    const saved = JSON.parse(readFileSync(join(directory, "report.json"), "utf8"));
    assert.equal(saved.state, "stopped"); assert.equal(saved.results.length, 3); assert.equal(saved.results[0].outcome, "success");
    assert.match(readFileSync(join(directory, "report.md"), "utf8"), /UPSTREAM_NETWORK/);
    let factories = 0;
    await assert.rejects(runExperiment({ mode: "mock", config, createRuntime: async () => { factories++; return runtime(); }, checkpoint: () => { throw new Error("disk failure"); } }));
    assert.equal(factories, 0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("union durable global ledger rejects tenth attempt and all repeated claims", () => {
  const directory = mkdtempSync(join(tmpdir(), "poi-union-budget-"));
  try {
    const budget = claimLiveBudget(directory);
    for (let i = 0; i < 9; i++) budget.beforeHttp();
    assert.throws(() => budget.beforeHttp()); assert.throws(() => claimLiveBudget(directory));
    assert.equal(readFileSync(join(directory, "live-attempts.jsonl"), "utf8").trim().split("\n").length, 9);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("union two independent processes cannot claim the same V1 live reservation", async () => {
  const directory = mkdtempSync(join(tmpdir(), "poi-union-race-"));
  try {
    const moduleUrl = new URL("../scripts/experiments/poi-union/storage.js", import.meta.url).href;
    const code = `import { claimLiveBudget } from ${JSON.stringify(moduleUrl)}; try { claimLiveBudget(process.argv[1]); } catch { process.exitCode = 2; }`;
    const worker = () => new Promise<number | null>((done, reject) => { const child = spawn(process.execPath, ["--input-type=module", "-e", code, directory], { stdio: "ignore" }); child.on("error", reject); child.on("exit", done); });
    assert.deepEqual((await Promise.all([worker(), worker()])).sort(), [0, 2]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("union CLI refuses unauthorized live, unknown/duplicate flags and override budgets", () => {
  assert.equal(parseArgs([]).mode, "dry");
  for (const args of [["--mode", "live"], ["--mode", "live", "--config", "local.json"], ["--mode", "live", "--authorize-live-9"], ["--max-calls", "10"], ["--mode", "mock", "--mode", "live"], ["--authorize-live-9"], ["--reset-budget"], ["--ledger", "elsewhere"]]) assert.throws(() => parseArgs(args));
  assert.equal(parseArgs(["--mode", "live", "--config", "local.json", "--authorize-live-9"]).mode, "live");
  const cli = new URL("../scripts/experiments/poi-union/cli.js", import.meta.url);
  const child = spawnSync(process.execPath, [fileURLToPath(cli), "--mode", "live"], { encoding: "utf8" });
  assert.equal(child.status, 1); assert.doesNotMatch(child.stderr, /postgresql:|restapi\.amap|key=/);
});

test("union compiled CLI default dry and explicit mock succeed with native network disabled", () => {
  const directory = mkdtempSync(join(tmpdir(), "poi-union-no-network-"));
  try {
    const preload = join(directory, "deny-network.cjs");
    writeFileSync(preload, 'globalThis.fetch = () => { throw new Error("native network forbidden"); };');
    const cli = fileURLToPath(new URL("../scripts/experiments/poi-union/cli.js", import.meta.url));
    for (const args of [[], ["--mode", "mock"]]) {
      const child = spawnSync(process.execPath, ["--require", preload, cli, ...args], { cwd: directory, encoding: "utf8" });
      assert.equal(child.status, 0, child.stderr);
      assert.match(child.stdout, /真实 HTTP 0/);
      assert.doesNotMatch(child.stderr, /native network forbidden/);
    }
    const privateConfig = join(directory, "config.json");
    writeFileSync(privateConfig, JSON.stringify(config));
    const refused = spawnSync(process.execPath, ["--require", preload, "--conditions=react-server", cli, "--mode", "live", "--config", privateConfig, "--authorize-live-9"], { encoding: "utf8", env: { ...process.env, AMAP_WEB_SERVICE_KEY: "", DATABASE_URL: "" } });
    assert.equal(refused.status, 1); assert.doesNotMatch(refused.stderr, /native network forbidden|postgresql:|key=/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("union JSON and Markdown never retain credentials, URLs, coordinates or raw POI text", async () => {
  const privateText = "SECRET-KEY postgresql://private:secret@db.internal/db https://restapi.amap.com/v5/place/around?key=SECRET-KEY 123.456789,34.567891";
  const report = await runExperiment({ mode: "mock", config: { ...config, locations: config.locations.map((s, i) => ({ ...s, longitude: 123.456789 + i, latitude: 34.567891 })) }, checkpoint: noop,
    createRuntime: async () => runtime({ key: "SECRET-KEY", fetchImpl: async () => Response.json({ status: "1", infocode: privateText, info: privateText, pois: [{ typecode: privateText, id: privateText, name: privateText, location: privateText, business: { cost: privateText } }, { typecode: "100100" }] }) }) });
  for (const output of [JSON.stringify(publicReport(report)), markdown(report)]) {
    for (const forbidden of ["SECRET-KEY", "postgresql://", "restapi.amap.com", "key=", "123.456789", "34.567891", '"location":', '"business":']) assert.ok(!output.includes(forbidden), forbidden);
    assert.match(output, /unconfirmed|未确认/);
  }
  const failed = await mock({ beforeAttempt: async () => { throw new Error(privateText); } });
  assert.equal(failed.results[0]!.errorCode, "INTERNAL_ERROR"); assert.ok(!JSON.stringify(publicReport(failed)).includes(privateText));
});
