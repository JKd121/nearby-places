import assert from "node:assert/strict";
import { mock, test } from "node:test";
let calls = 0;
let prepare: () => Promise<void> = async () => { calls++; };
mock.module("../src/server/admission.js", { namedExports: { prepareServerAdmission: () => prepare() } });
const { register } = await import("../instrumentation.js");
async function environment(values: Record<string, string | undefined>, action: () => Promise<void>) {
  const before = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await action();
  } finally { for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}
test("build, Edge and missing configuration skip startup database work", async () => {
  for (const values of [
    { NEXT_RUNTIME: "nodejs", NEXT_PHASE: "phase-production-build", DATABASE_URL: "placeholder" },
    { NEXT_RUNTIME: "edge", NEXT_PHASE: undefined, DATABASE_URL: "placeholder" },
    { NEXT_RUNTIME: "nodejs", NEXT_PHASE: undefined, DATABASE_URL: undefined },
  ]) await environment(values, register);
  assert.equal(calls, 0);
});
test("Node startup awaits readiness before becoming ready", async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  prepare = () => { calls++; return pending; };
  await environment({ NEXT_RUNTIME: "nodejs", NEXT_PHASE: undefined, DATABASE_URL: "placeholder" }, async () => {
    let done = false; const work = register().then(() => { done = true; });
    await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(done, false); release(); await work; assert.equal(done, true);
  });
});
test("startup failure emits only a fixed safe code and leaves request preparation available", async t => {
  const logs: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  prepare = async () => { throw Error("SECRET database URL"); };
  await environment({ NEXT_RUNTIME: "nodejs", NEXT_PHASE: undefined, DATABASE_URL: "placeholder" }, register);
  assert.equal(logs.length, 1); assert.ok(!JSON.stringify(logs).includes("SECRET"));
  assert.match(JSON.stringify(logs), /ADMISSION_UNAVAILABLE/);
});
