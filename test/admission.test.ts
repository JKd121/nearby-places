import assert from "node:assert/strict";
import test from "node:test";
import { setAdmissionHook } from "./admission-fixture.js";
import { AdmissionError } from "../src/admission/errors.js";
import { budgetPeriod, createAdmission, type PostgresAdmissionStore, type Reservation } from "../src/admission/service.js";
import { createRequestContext, cancellableDelay } from "../src/amap/request-context.js";
import { isRequestTerminal } from "../src/amap/errors.js";
import { createAmapTransport } from "../src/amap/transport.js";
const { mapServerError } = await import("../src/server/http.js");
const { POST: search } = await import("../app/api/search/route.js");
const { POST: resolve } = await import("../app/api/resolve-location/route.js");
const { POST: page } = await import("../app/api/search/page/route.js");

const url = new URL("https://restapi.amap.com/v3/geocode/geo?key=test-only");
function fixture(overrides: Record<string, unknown> = {}) {
  const calls = { reserve: 0, grant: 0 };
  const store = {
    async reserve() { calls.reserve++; return { resourceId: "test", version: 1, scheduledAt: new Date(), expiresAt: new Date(Date.now() + 200), delayMs: 0, validForMs: 200 } satisfies Reservation; },
    async grant() { calls.grant++; return { validForMs: 100 }; }, ...overrides,
  } as unknown as PostgresAdmissionStore;
  return { store, calls };
}

test("Shanghai day/month/leap-year boundaries do not follow host timezone", () => {
  assert.deepEqual(budgetPeriod(new Date("2028-02-29T15:59:59.999Z")), { day: "2028-02-29", month: "2028-02", nextDay: "2028-02-29T16:00:00.000Z", nextMonth: "2028-02-29T16:00:00.000Z" });
  assert.equal(budgetPeriod(new Date("2026-12-31T16:00:00Z")).month, "2027-01");
});

test("reservation then grant then exactly one send; no permit replay", async () => {
  const { store, calls } = fixture(); const context = createRequestContext();
  const permit = await createAdmission(store, "test")("geocode", context.signal, context);
  assert.ok(permit); permit.assertValid(); assert.throws(() => permit.assertValid(), /admission/i);
  assert.deepEqual(calls, { reserve: 1, grant: 1 }); context.dispose();
});

test("cancel while waiting makes no grant or HTTP call", async () => {
  const { store, calls } = fixture({ async reserve() { calls.reserve++; return { resourceId: "test", version: 1, scheduledAt: new Date(), expiresAt: new Date(Date.now() + 500), delayMs: 100, validForMs: 500 }; } });
  const parent = new AbortController(); const context = createRequestContext(parent.signal); let sends = 0;
  const pending = createAmapTransport(async () => { sends++; return Response.json({ status: "1" }); }, { context, beforeAttempt: createAdmission(store, "test") }).requestJson(url, "geocode");
  parent.abort(); await assert.rejects(pending, (e: unknown) => isRequestTerminal(e));
  await cancellableDelay(5); assert.equal(calls.grant, 0); assert.equal(sends, 0); context.dispose();
});

test("a late DB completion after business deadline cannot send", async () => {
  const { store } = fixture({ async grant() { await cancellableDelay(25); return { validForMs: 100 }; } });
  const context = createRequestContext(undefined, 10); let sends = 0;
  await assert.rejects(createAmapTransport(async () => { sends++; return Response.json({ status: "1" }); }, { context, beforeAttempt: createAdmission(store, "test") }).requestJson(url, "geocode"));
  await cancellableDelay(35); assert.equal(sends, 0); context.dispose();
});

test("ambiguous commit/unavailable DB and expired final permit never send", async () => {
  for (const grant of [async () => { throw new Error("SECRET database URL"); }, async () => ({ validForMs: -1 })]) {
    const { store } = fixture({ grant }); let sends = 0;
    await assert.rejects(createAmapTransport(async () => { sends++; return Response.json({ status: "1" }); }, { beforeAttempt: createAdmission(store, "test") }).requestJson(url, "geocode"), isRequestTerminal);
    assert.equal(sends, 0);
  }
});

test("readiness wait is bounded to one extra check, and cancellation interrupts it", async () => {
  let checks = 0;
  const { store } = fixture({ async grant() { checks++; return { delayMs: 1 }; } });
  const context = createRequestContext();
  await assert.rejects(createAdmission(store, "test")("geocode", context.signal, context), isRequestTerminal);
  assert.equal(checks, 2); context.dispose();
  const parent = new AbortController(); const other = createRequestContext(parent.signal);
  const delayed = fixture({ async grant() { parent.abort(); return { delayMs: 50 }; } });
  await assert.rejects(createAdmission(delayed.store, "test")("geocode", other.signal, other), isRequestTerminal);
  other.dispose();
});

test("local DB ingress cap remains occupied until cancelled underlying work actually settles", async () => {
  let release: () => void = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  const { store } = fixture({ async reserve() { await held; throw new AdmissionError("ADMISSION_UNAVAILABLE"); } });
  const hook = createAdmission(store, "test");
  const parent = new AbortController();
  const pending = Array.from({ length: 12 }, () => assert.rejects(hook("geocode", parent.signal), isRequestTerminal));
  parent.abort(); await Promise.all(pending);
  await assert.rejects(hook("geocode", new AbortController().signal), codeUnavailable);
  release(); await cancellableDelay(5);
  await assert.rejects(hook("geocode", new AbortController().signal), codeUnavailable);
  function codeUnavailable(e: unknown) { return e instanceof AdmissionError && e.code === "ADMISSION_UNAVAILABLE"; }
});

test("budget rejection remains terminal and safe across all three real routes", async () => {
  const previousKey = process.env.AMAP_WEB_SERVICE_KEY, original = globalThis.fetch;
  process.env.AMAP_WEB_SERVICE_KEY = "test-only-SECRET";
  let sends = 0; globalThis.fetch = async () => { sends++; return Response.json({ status: "1", pois: [] }); };
  const centre = { query: "fixture", formattedAddress: "fixture", province: null, city: null, district: null, level: null, longitude: 114, latitude: 22 };
  try {
    for (const [route, body] of [[resolve, { query: "fixture" }], [search, { center: centre, resolvedLocation: centre, categoryIds: ["hotel", "mall"], radiusMeters: 3000 }], [page, { center: centre, categoryId: "hotel", radiusMeters: 3000 }]] as const) {
      setAdmissionHook(async () => { throw new AdmissionError("DAILY_BUDGET_EXHAUSTED", "2026-10-28T16:00:00.000Z"); });
      const response = await route(new Request("http://localhost/", { method: "POST", body: JSON.stringify(body) }));
      assert.equal(response.status, 429); const json = await response.json(); assert.equal(json.error.code, "DAILY_BUDGET_EXHAUSTED"); assert.ok(json.error.retryAt);
    }
    assert.equal(sends, 0);
    let checks = 0;
    setAdmissionHook(async () => { if (++checks === 2) throw new AdmissionError("MONTHLY_BUDGET_EXHAUSTED"); });
    const response = await search(new Request("http://localhost/", { method: "POST", body: JSON.stringify({ center: centre, resolvedLocation: centre, categoryIds: ["hotel", "mall", "hotpot"], radiusMeters: 3000 }) }));
    assert.equal(response.status, 200); assert.equal(checks, 2); assert.equal(sends, 1);
    const payload = await response.json() as { categories: { status: string }[]; termination: { code: string } };
    assert.deepEqual(payload.categories.map(item => item.status), ["empty", "error", "skipped"]);
    assert.equal(payload.termination.code, "MONTHLY_BUDGET_EXHAUSTED");
  } finally { setAdmissionHook(async () => {}); globalThis.fetch = original;
    if (previousKey === undefined) delete process.env.AMAP_WEB_SERVICE_KEY; else process.env.AMAP_WEB_SERVICE_KEY = previousKey; }
});

test("admission errors map to safe 429/503 and are request terminal", async () => {
  for (const code of ["DAILY_BUDGET_EXHAUSTED", "MONTHLY_BUDGET_EXHAUSTED", "ADMISSION_WAIT_EXCEEDED", "ADMISSION_UNAVAILABLE"] as const) {
    const e = new AdmissionError(code); assert.equal(isRequestTerminal(e), true);
    const response = mapServerError(e);
    assert.equal(response.status, code === "ADMISSION_UNAVAILABLE" ? 503 : 429);
    assert.equal((await response.json() as {error:{code:string}}).error.code, code);
  }
});

for (const code of ["ADMISSION_WAIT_EXCEEDED", "ADMISSION_UNAVAILABLE", "DAILY_BUDGET_EXHAUSTED", "MONTHLY_BUDGET_EXHAUSTED"] as const) test(`${code} after one success produces partial response without later calls`, async () => {
  const previousKey = process.env.AMAP_WEB_SERVICE_KEY, original = globalThis.fetch;
  process.env.AMAP_WEB_SERVICE_KEY = "test-only-SECRET";
  let checks = 0, sends = 0;
  globalThis.fetch = async () => { sends++; return Response.json({ status: "1", pois: [] }); };
  const centre = { query: "fixture", formattedAddress: "fixture", province: null, city: null, district: null, level: null, longitude: 114, latitude: 22 };
  try {
    setAdmissionHook(async () => { if (++checks === 2) throw new AdmissionError(code); });
    const response = await search(new Request("http://localhost/", { method: "POST", body: JSON.stringify({ center: centre, resolvedLocation: centre, categoryIds: ["hotel", "mall", "hotpot"], radiusMeters: 3000 }) }));
    const body = await response.text(); const parsed = JSON.parse(body);
    assert.equal(response.status, 200); assert.equal(checks, 2); assert.equal(sends, 1);
    assert.deepEqual(parsed.categories.map((x: {status: string}) => x.status), ["empty", "error", "skipped"]);
    assert.deepEqual(parsed.termination, { code, categoryId: "mall" });
    assert.equal(body.includes("SECRET"), false);
  } finally { setAdmissionHook(async () => {}); globalThis.fetch = original; if (previousKey === undefined) delete process.env.AMAP_WEB_SERVICE_KEY; else process.env.AMAP_WEB_SERVICE_KEY = previousKey; }
});
