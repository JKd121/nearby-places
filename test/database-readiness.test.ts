import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createDatabaseReadiness } from "../src/db/readiness.js";
import { admissionPoolPolicy } from "../src/db/admission-pool-policy.js";
import { withAdmissionPreparation } from "../src/admission/prepare.js";
import { AdmissionError } from "../src/admission/errors.js";
import { createAdmission, PostgresAdmissionStore } from "../src/admission/service.js";
import { createRequestContext } from "../src/amap/request-context.js";

const unavailable = (e: unknown) => e instanceof AdmissionError && e.code === "ADMISSION_UNAVAILABLE";
const tick = () => delay(0);
function deferred() { let resolve!: () => void; let reject!: (e: Error) => void; const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

test("one instance shares a single warmup across startup and concurrent waiters", async () => {
  const probe = deferred(); let calls = 0;
  const state = createDatabaseReadiness({ probe: () => { calls++; return probe.promise; }, hasConnection: () => true });
  const all = Promise.all(Array.from({ length: 12 }, () => state.ensure()));
  await tick(); assert.equal(calls, 1); probe.resolve(); await all; await tick();
  await state.ensure(); assert.equal(calls, 1);
});

test("a cancelling request leaves the shared preparation available to another waiter", async () => {
  const probe = deferred(); const controller = new AbortController(); let calls = 0;
  const state = createDatabaseReadiness({ probe: () => { calls++; return probe.promise; }, hasConnection: () => true });
  const cancelled = assert.rejects(state.ensure(controller.signal), (e: unknown) => (e as { code: string }).code === "REQUEST_CANCELLED");
  const survivor = state.ensure(); controller.abort(); await cancelled;
  probe.resolve(); await survivor; assert.equal(calls, 1);
});

test("pre-cancelled preparation starts no database work", async () => {
  let calls = 0; const controller = new AbortController(); controller.abort();
  const state = createDatabaseReadiness({ probe: async () => { calls++; }, hasConnection: () => true });
  await assert.rejects(state.ensure(controller.signal)); assert.equal(calls, 0);
});

test("failed probe is sanitized, backs off, and allows a later independent request", async () => {
  let time = 0, calls = 0;
  const state = createDatabaseReadiness({ now: () => time, hasConnection: () => true, cooldownMs: 5, probe: async () => { if (++calls === 1) throw Error("SECRET connection string"); } });
  await assert.rejects(state.ensure(), unavailable); await tick();
  await state.ensure(); assert.equal(calls, 2);
  time = 1001; await state.ensure(); assert.equal(calls, 2);
});

test("readiness expires on wall-clock idle, pool removal or clock rollback", async () => {
  let time = 100, calls = 0, connection = true;
  const state = createDatabaseReadiness({ now: () => time, hasConnection: () => connection, probe: async () => { calls++; connection = true; } });
  await state.ensure(); await tick(); time = 10101; await state.ensure(); await tick();
  connection = false; await state.ensure(); await tick();
  time = 1; await state.ensure(); await tick(); state.invalidate(); await state.ensure();
  assert.equal(calls, 5);
});

test("a wall-clock rollback does not prolong a failed preparation cooldown", async () => {
  let time = 1000, calls = 0;
  const state = createDatabaseReadiness({ now: () => time, hasConnection: () => true, probe: async () => { if (++calls === 1) throw Error("fixture"); } });
  await assert.rejects(state.ensure(), unavailable); await tick(); time = 0;
  await state.ensure(); assert.equal(calls, 2);
});

test("active admission refreshes freshness while idle/resumed instances revalidate", async () => {
  let time = 0, calls = 0;
  const state = createDatabaseReadiness({ now: () => time, hasConnection: () => true, probe: async () => { calls++; } });
  await state.ensure(); await tick(); time = 9000; state.touch(); time = 15000; await state.ensure(); assert.equal(calls, 1);
  time = 20000; await state.ensure(); assert.equal(calls, 2);
});

test("invalidation during an in-flight probe prevents a false ready result", async () => {
  const probe = deferred(); const state = createDatabaseReadiness({ probe: () => probe.promise, hasConnection: () => true });
  const failure = assert.rejects(state.ensure(), unavailable); await tick(); state.invalidate(); probe.resolve(); await failure;
});

test("timed-out underlying work holds the single-flight slot until it settles", async () => {
  const probe = deferred(); let calls = 0, time = 0;
  const state = createDatabaseReadiness({ probe: () => { calls++; return calls === 1 ? probe.promise : Promise.resolve(); }, hasConnection: () => true, timeoutMs: 5, now: () => time });
  await assert.rejects(state.ensure(), unavailable); time = 5000;
  await assert.rejects(state.ensure(), unavailable); assert.equal(calls, 1);
  probe.resolve(); await tick(); await state.ensure(); assert.equal(calls, 2);
});

test("pool profiles retain local idle capacity and release Vercel idle capacity", () => {
  const local = admissionPoolPolicy(false), vercel = admissionPoolPolicy(true);
  assert.equal(local.min, 1); assert.equal(vercel.min, 0);
  assert.equal(local.idleTimeoutMillis, 60000); assert.equal(vercel.idleTimeoutMillis, 5000);
  assert.equal(local.max, 4); assert.equal(vercel.max, 4);
  assert.equal(local.connectionTimeoutMillis, 8000);
  assert.equal("statement_timeout" in local, false); assert.equal("idle_in_transaction_session_timeout" in vercel, false);
});

test("slow preparation completes before the real short admission clock starts", async () => {
  let prepared = false, reservations = 0;
  const state = createDatabaseReadiness({ probe: async () => { await delay(25); prepared = true; }, hasConnection: () => true });
  const store = {
    async reserve(_credential: string, _operation: string, _signal: AbortSignal, remaining: () => number) {
      assert.equal(prepared, true); assert.ok(remaining() > 1980); reservations++;
      return { resourceId: "test", version: 1, scheduledAt: new Date(), expiresAt: new Date(Date.now() + 200), delayMs: 0, validForMs: 200 };
    }, async grant() { return { validForMs: 100 }; },
  } as unknown as PostgresAdmissionStore;
  const hook = withAdmissionPreparation(createAdmission(store, "test"), async () => state);
  const context = createRequestContext(undefined, 5000);
  try { const permit = await hook("nearby", context.signal, context); assert.ok(permit); permit.assertValid(); assert.equal(reservations, 1); }
  finally { context.dispose(); }
});

test("preparation failure/cancellation prevents every reservation and HTTP permit", async () => {
  let admits = 0;
  const state = createDatabaseReadiness({ probe: async () => { throw Error("SECRET"); }, hasConnection: () => true });
  const hook = withAdmissionPreparation(async () => { admits++; }, async () => state);
  await assert.rejects(hook("nearby", new AbortController().signal), unavailable); assert.equal(admits, 0);
});

test("overall request cancellation still bounds a shared preparation waiter", async () => {
  const probe = deferred(); let admits = 0;
  const state = createDatabaseReadiness({ probe: () => probe.promise, hasConnection: () => true });
  const hook = withAdmissionPreparation(async () => { admits++; }, async () => state);
  const context = createRequestContext(undefined, 5);
  try { await assert.rejects(hook("nearby", context.signal, context), (e: unknown) => (e as { code: string }).code === "REQUEST_DEADLINE_EXCEEDED"); }
  finally { probe.resolve(); context.dispose(); }
  assert.equal(admits, 0);
});


test("a cancelled cooldown waiter leaves one shared recovery for other categories", async () => {
  let calls=0;const state=createDatabaseReadiness({cooldownMs:20,hasConnection:()=>true,probe:async()=>{if(++calls===1)throw Error("fixture");}});
  await assert.rejects(state.ensure(),unavailable);await tick();
  const parent=new AbortController();const cancelled=assert.rejects(state.ensure(parent.signal));const recovered=state.ensure();parent.abort();await cancelled;await recovered;
  assert.equal(calls,2);await state.ensure();assert.equal(calls,2);
});

test("a failed preparation category recovers after cooldown within the same two-worker search", async t => {
  const logs: unknown[][] = []; t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  const { executeResolvedSearch } = await import("../src/search/service.js");
  const { createAmapTransport } = await import("../src/amap/transport.js");
  const { createAmapClientWithTransport } = await import("../src/amap/client.js");
  let probes = 0, sends = 0, admits = 0;
  const readiness = createDatabaseReadiness({ cooldownMs: 5, hasConnection: () => true,
    probe: async () => { if (++probes === 1) throw Object.assign(Error("PRIVATE"), { code: "ECONNRESET" }); } });
  const transport = createAmapTransport(async () => { sends++; return Response.json({ status: "1", pois: [] }); }, {
    beforeAttempt: withAdmissionPreparation(async () => { admits++; }, async () => readiness)
  });
  const center = { query: "fixture", formattedAddress: "fixture", province: null, city: null, district: null, level: null, longitude: 114, latitude: 22 };
  const response = await executeResolvedSearch({ center, resolvedLocation: center, categoryIds: ["bakery", "billiards", "gym"], radiusMeters: 3000 }, createAmapClientWithTransport("fake", transport));
  assert.deepEqual(response.categories.map(c => c.status), ["error", "empty", "empty"]);
  assert.equal(response.termination, undefined); assert.equal(probes, 2); assert.equal(admits, 2); assert.equal(sends, 2);
  assert.equal(logs.length, 1); assert.ok(!JSON.stringify(logs).includes("PRIVATE"));
});
