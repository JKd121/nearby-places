import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildUrl, plan, sortComparisonPlan, SYNTHETIC_CONFIG as config } from "../scripts/experiments/poi-union/model.js";
import { runExperiment } from "../scripts/experiments/poi-union/runner.js";
import { localExplorationRuntime } from "../scripts/experiments/poi-union/explore.js";
import { claimSortBudget, parseSortArgs } from "../scripts/experiments/poi-union/sort-comparison.js";
import { markdown, publicReport, type Report } from "../scripts/experiments/poi-union/report.js";
import { sortMetrics } from "../scripts/experiments/poi-union/sort-report.js";

test("sort comparison pairs three sites with identical ten-category parameters and alternating order", () => {
  const trials = sortComparisonPlan(config);
  assert.equal(trials.length, 6);
  assert.deepEqual(trials.map(t => t.sortRule), ["distance", "weight", "weight", "distance", "distance", "weight"]);
  for (let i = 0; i < 3; i++) {
    const pair = trials.slice(i * 2, i * 2 + 2);
    const urls = pair.map(t => buildUrl("private", config.locations[i]!, config.radiusMeters, t));
    assert.ok(pair.every(t => t.siteId === `site-${i + 1}` && t.categories.length === 10));
    for (const u of urls) {
      assert.equal(u.pathname, "/v5/place/around"); assert.equal(u.searchParams.get("page_num"), "1"); assert.equal(u.searchParams.get("page_size"), "25");
      u.searchParams.delete("sortrule");
    }
    assert.equal(urls[0]!.href, urls[1]!.href);
  }
  assert.ok(plan(config).every(t => buildUrl("test", config.locations[0]!, 1000, t).searchParams.get("sortrule") === "distance"));
});

test("sort dry never creates runtime and mock makes exactly six simulated requests", async () => {
  const dry = await runExperiment({ mode: "dry", design: "sort-comparison", executionControl: "local-exploration", config, checkpoint() {}, createRuntime: async () => { throw new Error("Forbidden"); } });
  assert.equal(dry.results.length, 6); assert.equal(dry.httpCalls + dry.simulatedCalls, 0); assert.equal(dry.hardLimit, 6);
  const mock = await runExperiment({ mode: "mock", design: "sort-comparison", executionControl: "local-exploration", config, checkpoint() {} });
  assert.equal(mock.version, "poi-union-sort-v1"); assert.equal(mock.simulatedCalls, 6); assert.equal(mock.httpCalls, 0); assert.equal(mock.state, "completed");
  assert.equal(publicReport(mock).hardLimit, 6); assert.match(markdown(mock), /distance \/ weight/);
});

test("sort runner uses correct site for every pair, remains serial and reports conservative metrics", async () => {
  const urls: URL[] = [];
  let active = 0, peak = 0;
  const runtime = localExplorationRuntime("private-key", async input => {
    active++; peak = Math.max(peak, active); await Promise.resolve(); active--;
    const url = new URL(String(input)); urls.push(url);
    const codes = url.searchParams.get("sortrule") === "distance" ? ["100100", "100100", "150501"] : ["100100", "050117", "080111"];
    return Response.json({ status: "1", infocode: "10000", pois: codes.map(typecode => ({ typecode, name: "private-poi-name" })) });
  }, 0);
  const r = await runExperiment({ mode: "mock", design: "sort-comparison", executionControl: "local-exploration", config, checkpoint() {}, createRuntime: async () => runtime });
  assert.equal(urls.length, 6); assert.equal(peak, 1);
  assert.deepEqual(urls.map(u => u.searchParams.get("location")), ["0,0", "0,0", "1,1", "1,1", "2,2", "2,2"]);
  assert.ok(urls.every(u => u.searchParams.get("types")!.split("|").length === 10));
  const d = sortMetrics(r.results[0]!)!, w = sortMetrics(r.results[1]!)!;
  assert.equal(d.confirmedCategories, 1); assert.equal(w.confirmedCategories, 3);
  assert.equal(d.largestRawTypecodePercent, 66.67); assert.equal(r.results[0]!.stats!.unconfirmedCount, 1);
  for (const output of [JSON.stringify(publicReport(r)), markdown(r)]) {
    assert.doesNotMatch(output, /private-key|private-poi-name|restapi\.amap|postgresql:|"location":|longitude|latitude/);
    assert.match(output, /150501/);
  }
});

test("sort budget reserves only its own six calls and rejects repeat or seventh attempts", () => {
  const root = mkdtempSync(join(tmpdir(), "sort-budget-"));
  try {
    writeFileSync(join(root, "live-attempts.jsonl"), "previous-round-untouched\n");
    const dir = join(root, "sort-comparison-v1"), budget = claimSortBudget(dir);
    assert.throws(() => claimSortBudget(dir));
    for (let i = 0; i < 6; i++) budget.beforeHttp();
    assert.throws(() => budget.beforeHttp());
    assert.equal(readFileSync(join(root, "live-attempts.jsonl"), "utf8"), "previous-round-untouched\n");
    assert.deepEqual(readFileSync(join(dir, "sort-attempts.jsonl"), "utf8").trim().split("\n").map(s => JSON.parse(s).attempt), [1,2,3,4,5,6]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("sort budget has one winner across processes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sort-process-"));
  try {
    const module = new URL("../scripts/experiments/poi-union/sort-comparison.js", import.meta.url).href;
    const source = `import {claimSortBudget} from ${JSON.stringify(module)}; try {claimSortBudget(process.argv[1]);} catch {process.exitCode=2;}`;
    const worker = () => new Promise<number | null>((done, reject) => { const child = spawn(process.execPath, ["--input-type=module", "-e", source, dir], { stdio: "ignore" }); child.on("error", reject); child.on("exit", done); });
    assert.deepEqual((await Promise.all([worker(), worker()])).sort(), [0, 2]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("sort skips recoverable HTTP errors, keeps checkpoints and stops on local journal failure", async () => {
  let calls = 0, writes = 0;
  const checkpoints: Report[] = [];
  const runtime = localExplorationRuntime("test", async () => ++calls === 2 ? new Response("private", { status: 503 }) : Response.json({ status: "1", pois: [] }), 0);
  runtime.beforeHttp = () => { if (++writes === 4) throw new Error("storage failed"); };
  const r = await runExperiment({ mode: "mock", design: "sort-comparison", executionControl: "local-exploration", config, checkpoint: p => checkpoints.push(structuredClone(p)), createRuntime: async () => runtime });
  assert.equal(calls, 3); assert.equal(r.state, "stopped"); assert.equal(r.results.length, 4);
  assert.equal(r.results[1]!.errorCode, "UPSTREAM_HTTP"); assert.equal(r.results[2]!.outcome, "success");
  assert.equal(r.results[3]!.errorCode, "INTERNAL_ERROR"); assert.equal(r.skippedTrials, 2);
  assert.equal(checkpoints.at(-1)!.results[0]!.outcome, "success"); assert.equal(sortMetrics(r.results[3]!), null);
});

test("sort authorization is specific to this six-call round", () => {
  assert.equal(parseSortArgs([]).mode, "dry");
  for (const args of [["--mode", "live"], ["--mode", "live", "--config", "local.json", "--authorize-local-live-9"], ["--mode", "live", "--config", "local.json", "--authorize-live-9"], ["--authorize-sort-live-6"], ["--max-calls", "9"], ["--ledger", "other"]]) assert.throws(() => parseSortArgs(args));
  assert.equal(parseSortArgs(["--mode", "live", "--config", "local.json", "--authorize-sort-live-6"]).authorized, true);
});

test("sort CLI dry/mock work with database imports and native network blocked", () => {
  const dir = mkdtempSync(join(tmpdir(), "sort-offline-"));
  try {
    const preload = join(dir, "deny.cjs");
    writeFileSync(preload, `globalThis.fetch=()=>{throw new Error('native HTTP forbidden')}; require('node:module').registerHooks({resolve(s,c,n){if(/prisma|^pg$|server\\/admission|db\\//.test(s))throw new Error('database forbidden');return n(s,c)}});`);
    const cli = fileURLToPath(new URL("../scripts/experiments/poi-union/sort-comparison.js", import.meta.url));
    for (const args of [[], ["--mode", "mock"]]) {
      const child = spawnSync(process.execPath, ["--require", preload, cli, ...args], { cwd: dir, encoding: "utf8", timeout: 15000 });
      assert.equal(child.status, 0, child.stderr); assert.match(child.stdout, /真实 HTTP 0/);
    }
    const refused = spawnSync(process.execPath, ["--require", preload, cli, "--mode", "live"], { cwd: dir, encoding: "utf8", timeout: 15000 });
    assert.equal(refused.status, 1); assert.doesNotMatch(refused.stderr, /postgresql:|key=|native HTTP forbidden|database forbidden/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
