import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { localExplorationRuntime, parseExplorationArgs } from "../scripts/experiments/poi-union/explore.js";
import { claimExplorationBudget } from "../scripts/experiments/poi-union/exploration-budget.js";
import { claimLiveBudget } from "../scripts/experiments/poi-union/storage.js";
import { runExperiment } from "../scripts/experiments/poi-union/runner.js";
import { SYNTHETIC_CONFIG } from "../scripts/experiments/poi-union/model.js";
import { publicReport, markdown } from "../scripts/experiments/poi-union/report.js";

const config = SYNTHETIC_CONFIG;
const success = () => Response.json({ status: "1", infocode: "10000", pois: [{ typecode: "100100" }] });
const directory = () => mkdtempSync(join(tmpdir(), "poi-local-"));

test("local exploration requires its own explicit authorization and private config for live", () => {
  assert.equal(parseExplorationArgs([]).mode, "dry");
  for (const args of [["--mode", "live"], ["--mode", "live", "--config", "private.json"], ["--mode", "live", "--config", "private.json", "--authorize-live-9"], ["--mode", "mock", "--authorize-local-live-9"]]) assert.throws(() => parseExplorationArgs(args));
  assert.equal(parseExplorationArgs(["--mode", "live", "--config", "private.json", "--authorize-local-live-9"]).authorized, true);
});

test("local exploration import graph and dry/mock run succeed with database and real network forbidden", () => {
  const source = `
    import { registerHooks } from 'node:module';
    registerHooks({ resolve(specifier, context, next) {
      if (/prisma|^pg$|server\\/admission|db\\/|\\/live\\.js$/.test(specifier)) throw new Error('Database import forbidden');
      return next(specifier, context);
    }});
    globalThis.fetch = () => { throw new Error('Real network forbidden'); };
    const { runExperiment } = await import('./dist/scripts/experiments/poi-union/runner.js');
    const { SYNTHETIC_CONFIG } = await import('./dist/scripts/experiments/poi-union/model.js');
    await import('./dist/scripts/experiments/poi-union/explore.js');
    for (const mode of ['dry', 'mock']) {
      const report = await runExperiment({mode,config:SYNTHETIC_CONFIG,executionControl:'local-exploration',checkpoint() {}});
      if (report.httpCalls !== 0 || report.results.length !== 9 || report.simulatedCalls !== (mode === 'mock' ? 9 : 0)) throw new Error('Unexpected calls');
    }`;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", source], { cwd: process.cwd(), encoding: "utf8", timeout: 15000 });
  assert.equal(child.status, 0, child.stderr);
});

test("local exploration skips upstream failures and retains all outcomes with nine serial first-page attempts", async () => {
  let calls = 0, active = 0, peak = 0;
  const snapshots: ReturnType<typeof publicReport>[] = [];
  const runtime = localExplorationRuntime("sensitive-key", async input => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/v5/place/around"); assert.equal(url.searchParams.get("page_num"), "1");
    assert.ok(url.searchParams.get("types")!.includes("|"));
    active++; peak = Math.max(peak, active);
    await Promise.resolve(); active--;
    if (++calls === 2) throw new Error("private raw error");
    if (calls === 4) return new Response("private body", { status: 503 });
    if (calls === 6) return Response.json({ status: "1", pois: {} });
    return success();
  }, 0);
  const report = await runExperiment({ mode: "mock", executionControl: "local-exploration", config, createRuntime: async () => runtime, checkpoint: r => snapshots.push(publicReport(r)) });
  assert.equal(calls, 9); assert.equal(peak, 1); assert.equal(report.state, "completed");
  assert.equal(report.results.filter(r => r.outcome === "success").length, 6);
  assert.equal(report.results.filter(r => r.outcome === "failed").length, 3);
  assert.equal(report.skippedTrials, 0); assert.equal(report.simulatedCalls, 9);
  assert.ok(report.results.every(r => r.admission === "local-budget"));
  assert.equal(snapshots.at(-1)!.results.length, 9);
  const output = JSON.stringify(publicReport(report)) + markdown(report);
  for (const sensitive of ["sensitive-key", "private raw error", "private body", "restapi.amap.com", "longitude", "latitude", "DATABASE_URL"]) assert.equal(output.includes(sensitive), false);
  assert.ok(output.includes("local-exploration"));
});

test("local exploration still stops on authentication, quota, rate-limit and unknown failures", async () => {
  for (const response of [() => Response.json({ status: "0", infocode: "10009" }), () => Response.json({ status: "0", infocode: "10003" }), () => Response.json({ status: "0", infocode: "10004" }), () => new Response("", { status: 429 }), () => { throw 123; }]) {
    let sends = 0;
    const runtime = localExplorationRuntime("test", async () => { sends++; return response(); }, 0);
    // The transport safely classifies thrown network errors as recoverable, including a thrown primitive.
    const report = await runExperiment({ mode: "mock", executionControl: "local-exploration", config, createRuntime: async () => runtime, checkpoint() {} });
    if (report.results[0]!.errorCode === "UPSTREAM_NETWORK") { assert.equal(sends, 9); continue; }
    assert.equal(sends, 1); assert.equal(report.state, "stopped"); assert.equal(report.skippedTrials, 8);
  }
  const report = await runExperiment({ mode: "mock", executionControl: "local-exploration", config,
    createRuntime: async () => { throw new Error("unknown local failure"); }, checkpoint() {} });
  assert.equal(report.state, "stopped"); assert.equal(report.results.length, 1);
});

test("local exploration cancellation preserves completed statistics without continuing", async () => {
  const controller = new AbortController();
  let calls = 0;
  const runtime = localExplorationRuntime("test", async () => { calls++; return success(); }, 0);
  const report = await runExperiment({ mode: "mock", executionControl: "local-exploration", config, signal: controller.signal,
    createRuntime: async () => runtime, checkpoint(r) { if (r.results.length === 2) controller.abort(); } });
  assert.equal(calls, 2); assert.equal(report.state, "stopped");
  assert.equal(report.results[0]!.stats!.returnedPois, 1); assert.equal(report.results[1]!.outcome, "success");
});

test("local exploration transfers the unused reservation once and shares the original nine-call journal", () => {
  for (const preexisting of [false, true]) {
    const dir = directory();
    try {
      if (preexisting) claimLiveBudget(dir);
      const guard = claimExplorationBudget(dir);
      assert.throws(() => claimExplorationBudget(dir)); assert.throws(() => claimLiveBudget(dir));
      for (let i = 0; i < 9; i++) guard.beforeHttp();
      assert.throws(() => guard.beforeHttp());
      const journal = readFileSync(join(dir, "live-attempts.jsonl"), "utf8").trim().split("\n").map(s => JSON.parse(s));
      assert.deepEqual(journal.map(r => r.attempt), [1,2,3,4,5,6,7,8,9]);
      assert.ok(journal.every(r => r.control === "local-exploration"));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test("local exploration rejects previously used, corrupt and unsupported reservations", () => {
  for (const scenario of ["attempt", "empty-journal", "corrupt", "wrong-limit", "wrong-count"]) {
    const dir = directory();
    try {
      const previous = claimLiveBudget(dir);
      if (scenario === "attempt") previous.beforeHttp();
      else if (scenario === "empty-journal") writeFileSync(join(dir, "live-attempts.jsonl"), "");
      else writeFileSync(join(dir, "live-budget.lock"), scenario === "corrupt" ? "invalid" : JSON.stringify({ version: "poi-union-v1", reserved: scenario === "wrong-limit" ? 90 : 9, calls: scenario === "wrong-count" ? 1 : 0 }));
      assert.throws(() => claimExplorationBudget(dir));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test("local exploration durable journal failure stops before HTTP and keeps prior results", async () => {
  let calls = 0, writes = 0;
  const runtime = localExplorationRuntime("test", async () => { calls++; return success(); }, 0);
  runtime.beforeHttp = () => { if (++writes === 3) throw new Error("disk unavailable"); };
  const report = await runExperiment({ mode: "mock", executionControl: "local-exploration", config, createRuntime: async () => runtime, checkpoint() {} });
  assert.equal(calls, 2); assert.equal(report.state, "stopped"); assert.equal(report.results.length, 3);
  assert.equal(report.results[2]!.errorCode, "INTERNAL_ERROR"); assert.equal(report.results[2]!.errorAction, "fatal");
  assert.equal(report.results[0]!.stats!.returnedPois, 1);
});

test("local exploration two processes can transfer an unused reservation only once", async () => {
  const dir = directory();
  try {
    claimLiveBudget(dir);
    const module = new URL("../scripts/experiments/poi-union/exploration-budget.js", import.meta.url).href;
    const source = `import {claimExplorationBudget} from ${JSON.stringify(module)}; try {claimExplorationBudget(process.argv[1]);} catch {process.exitCode=2;}`;
    const worker = () => new Promise<number | null>((done, reject) => {
      const child = spawn(process.execPath, ["--input-type=module", "-e", source, dir], { stdio: "ignore" });
      child.on("error", reject); child.on("exit", done);
    });
    assert.deepEqual((await Promise.all([worker(), worker()])).sort(), [0, 2]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("local exploration timeout is recorded and next trials proceed without retrying", async () => {
  let calls = 0;
  const runtime = localExplorationRuntime("test", async () => { if (++calls === 1) return new Promise<Response>(() => {}); return success(); }, 0);
  runtime.policy = { upstreamTimeoutMs: 10, maxResponseBytes: 1024 };
  const report = await runExperiment({ mode: "mock", executionControl: "local-exploration", config, createRuntime: async () => runtime, checkpoint() {} });
  assert.equal(calls, 9); assert.equal(report.results[0]!.errorCode, "UPSTREAM_TIMEOUT");
  assert.equal(report.results.filter(r => r.outcome === "success").length, 8); assert.equal(report.state, "completed");
});

test("local compiled CLI dry/mock work with database and native HTTP forbidden", () => {
  const dir = directory();
  try {
    const preload = join(dir, "deny.cjs");
    writeFileSync(preload, `globalThis.fetch=()=>{throw new Error('native HTTP forbidden')}; require('node:module').registerHooks({resolve(s,c,n){if(/prisma|^pg$|server\\/admission|db\\//.test(s))throw new Error('database forbidden');return n(s,c)}});`);
    const cli = fileURLToPath(new URL("../scripts/experiments/poi-union/explore.js", import.meta.url));
    for (const args of [[], ["--mode", "mock"]]) {
      const child = spawnSync(process.execPath, ["--require", preload, cli, ...args], { encoding: "utf8", cwd: dir, timeout: 15000 });
      assert.equal(child.status, 0, child.stderr); assert.match(child.stdout, /真实 HTTP 0/);
    }
    const child = spawnSync(process.execPath, ["--require", preload, cli, "--mode", "live"], { encoding: "utf8", cwd: dir, timeout: 15000 });
    assert.equal(child.status, 1); assert.doesNotMatch(child.stderr, /postgresql:|key=|native HTTP forbidden|database forbidden/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
