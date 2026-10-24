import assert from "node:assert/strict";
import test from "node:test";
import { getEventListeners } from "node:events";
import { abortable, cancellableDelay, createRequestContext } from "../src/amap/request-context.js";
import { AmapApiError, RequestTerminatedError } from "../src/amap/errors.js";
import { executeResolvedSearch, executeSecondPageSearch } from "../src/search/service.js";
import { getRequestPolicy, RequestPolicyError } from "../src/server/request-policy.js";
import { STAGE_A_POLICY } from "../src/amap/policy.js";
import { readRequestJson, withRequestLifecycle } from "../src/server/request-lifecycle.js";
import { RequestBodyTooLargeError } from "../src/amap/errors.js";
import type { GeocodedPlace, PlacePage } from "../src/amap/types.js";

const centre: GeocodedPlace = { query: "fixture", formattedAddress: "fixture", province: null, city: null, district: null, level: null, longitude: 114, latitude: 22 };
const request = { center: centre, resolvedLocation: centre, categoryIds: ["hotel", "mall", "bakery"] as ("hotel" | "mall" | "bakery")[], radiusMeters: 3000 as const };
const empty: PlacePage = { places: [], pageNumber: 1, pageSize: 25, returnedCount: 0, mayHaveNextApiPage: false };
const code = (expected: string) => (error: unknown) => error instanceof AmapApiError && error.code === expected;

test("contexts are isolated, retain first reason and dispose parent listeners/timers", async () => {
  const parent = new AbortController();
  const a = createRequestContext(parent.signal, 10); const b = createRequestContext();
  assert.equal(getEventListeners(parent.signal, "abort").length, 1);
  a.abort(new RequestTerminatedError("UPSTREAM_TIMEOUT"));
  parent.abort(); assert.ok(code("UPSTREAM_TIMEOUT")(a.signal.reason)); assert.equal(b.signal.aborted, false);
  a.dispose(); b.dispose(); assert.equal(getEventListeners(parent.signal, "abort").length, 0);
  const c = createRequestContext(undefined, 1); c.dispose();
  await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(c.signal.aborted, false);
});

test("abortable always removes listeners on fulfillment, rejection and cancellation", async () => {
  const context = createRequestContext();
  await abortable(Promise.resolve(1), context.signal);
  await assert.rejects(abortable(Promise.reject(Error("fixture")), context.signal));
  assert.equal(getEventListeners(context.signal, "abort").length, 0);
  const pending = abortable(new Promise<void>(() => {}), context.signal); context.abort(new RequestTerminatedError("REQUEST_CANCELLED"));
  await assert.rejects(pending, code("REQUEST_CANCELLED")); assert.equal(getEventListeners(context.signal, "abort").length, 0); context.dispose();
});

test("cancelled waiting stops before the next category and releases wait timer", async () => {
  const context = createRequestContext(); let calls = 0;
  const pending = executeResolvedSearch(request, { geocode: async () => centre, searchNearby: async () => { calls++; return empty; } }, async (ms, signal) => {
    assert.equal(ms, 500); setTimeout(() => context.abort(new RequestTerminatedError("REQUEST_CANCELLED")), 1); await cancellableDelay(ms, signal);
  }, undefined, context);
  await assert.rejects(pending, code("REQUEST_CANCELLED")); assert.equal(calls, 1); context.dispose();
});

for (const terminal of ["UPSTREAM_TIMEOUT", "UPSTREAM_AUTH_FAILED", "REQUEST_DEADLINE_EXCEEDED", "REQUEST_CANCELLED"] as const) test(`${terminal} ends the whole search without wait/next category`, async () => {
  const context = createRequestContext(); let calls = 0; let waits = 0;
  const error = terminal === "UPSTREAM_AUTH_FAILED" ? new AmapApiError("safe", null, "10001", terminal) : new RequestTerminatedError(terminal);
  await assert.rejects(executeResolvedSearch(request, { geocode: async () => centre, searchNearby: async () => { calls++; throw error; } }, async () => { waits++; }, undefined, context), e => e === error);
  assert.equal(calls, 1); assert.equal(waits, 0); assert.equal(context.signal.reason, error); context.dispose();
});

test("total deadline bounds non-cooperative category operation and injected wait", async () => {
  for (const stuck of ["category", "wait"]) {
    let calls = 0; const context = createRequestContext(undefined, 5);
    await assert.rejects(executeResolvedSearch(request, { geocode: async () => centre, searchNearby: async () => { calls++; return stuck === "category" ? new Promise<PlacePage>(() => {}) : empty; } }, async () => new Promise<void>(() => {}), undefined, context), code("REQUEST_DEADLINE_EXCEEDED"));
    assert.equal(calls, 1); context.dispose();
  }
});

test("all failed is an error; mixed and empty categories preserve ordering and safe partial results", async () => {
  const client = { geocode: async () => centre, searchNearby: async () => { throw new Error("SECRET raw upstream"); } };
  await assert.rejects(executeResolvedSearch(request, client, async () => {}), code("ALL_CATEGORIES_FAILED"));
  let calls = 0; const waits: number[] = [];
  const result = await executeResolvedSearch(request, { ...client, searchNearby: async () => { if (++calls === 1) throw Error("SECRET"); return empty; } }, async ms => { waits.push(ms); });
  assert.deepEqual(result.categories.map(r => r.category.key), request.categoryIds); assert.deepEqual(waits, [500, 500]);
  assert.equal(result.status, "partial success"); assert.equal(result.categories[1]?.status, "empty"); assert.equal(JSON.stringify(result).includes("SECRET"), false);
});

test("pre-cancelled search/page make no provider calls", async () => {
  const context = createRequestContext(); context.abort(new RequestTerminatedError("REQUEST_CANCELLED")); let calls = 0;
  const client = { geocode: async () => centre, searchNearby: async () => { calls++; return empty; } };
  await assert.rejects(executeResolvedSearch(request, client, undefined, undefined, context), code("REQUEST_CANCELLED"));
  await assert.rejects(executeSecondPageSearch({ center: centre, categoryId: "hotel", radiusMeters: 3000 }, client, context), code("REQUEST_CANCELLED"));
  assert.equal(calls, 0); context.dispose();
});

test("request termination reaches simultaneous child operations without a shared global controller", async () => {
  const context = createRequestContext();
  const children = [abortable(new Promise<void>(() => {}), context.signal), abortable(new Promise<void>(() => {}), context.signal)];
  context.abort(new RequestTerminatedError("UPSTREAM_TIMEOUT"));
  await Promise.all(children.map(p => assert.rejects(p, code("UPSTREAM_TIMEOUT")))); context.dispose();
});

test("central candidates use owner-confirmed host boundary; explicit overrides need positive values/headroom", () => {
  assert.equal(getRequestPolicy({ NODE_ENV: "production" }).requestTimeoutMs, 60000);
  assert.equal(getRequestPolicy({ NODE_ENV: "production" }).upstreamTimeoutMs, 8000);
  assert.equal(getRequestPolicy({ NODE_ENV: "production" }).maxResponseBytes, 1048576);
  assert.equal(getRequestPolicy({ NODE_ENV: "production" }).maxRequestBytes, 65536);
  const env = { NODE_ENV: "production", AMAP_UPSTREAM_TIMEOUT_MS: "8000", AMAP_REQUEST_TIMEOUT_MS: "60000", AMAP_MAX_RESPONSE_BYTES: "1048576", AMAP_HOST_MAX_DURATION_MS: "70000" };
  assert.equal(getRequestPolicy(env).requestTimeoutMs, 60000);
  for (const bad of [{ AMAP_HOST_MAX_DURATION_MS: "60000" }, { AMAP_UPSTREAM_TIMEOUT_MS: "60001" }, { AMAP_MAX_RESPONSE_BYTES: "0" }, { AMAP_REQUEST_TIMEOUT_MS: "NaN" }]) assert.throws(() => getRequestPolicy({ ...env, ...bad }), RequestPolicyError);
  assert.equal(getRequestPolicy({ NODE_ENV: "test" }).requestTimeoutMs, 60000);
});

function incoming(chunks: Uint8Array[], headers: Record<string, string> = {}, onCancel = () => {}) {
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { if (index < chunks.length) controller.enqueue(chunks[index++]!); else controller.close(); },
    cancel: onCancel,
  }, { highWaterMark: 0 });
  return new Request("http://localhost/", { method: "POST", body: stream, headers, duplex: "half" } as RequestInit);
}

test("inbound JSON accepts exactly 64 KiB and rejects one extra actual byte", async () => {
  const text = '{"value":1}';
  const bytes = new TextEncoder().encode(text + " ".repeat(STAGE_A_POLICY.maxRequestBytes - text.length));
  const context = createRequestContext();
  try {
    assert.deepEqual(await readRequestJson(incoming([bytes]), context, STAGE_A_POLICY.maxRequestBytes), { value: 1 });
    assert.equal(context.signal.aborted, false);
    await assert.rejects(readRequestJson(incoming([bytes, new Uint8Array([32])]), context, STAGE_A_POLICY.maxRequestBytes), RequestBodyTooLargeError);
    assert.equal(context.signal.aborted, true);
    assert.ok(code("REQUEST_BODY_TOO_LARGE")(context.signal.reason));
  } finally { context.dispose(); }
});

test("inbound chunks count UTF-8 bytes before decoding, including split multibyte characters", async () => {
  const bytes = new TextEncoder().encode('{"value":"中文"}');
  assert.ok(bytes.byteLength > '{"value":"中文"}'.length);
  for (const limit of [bytes.byteLength, bytes.byteLength - 1]) {
    const context = createRequestContext();
    try {
      const request = incoming([bytes.slice(0, 11), bytes.slice(11, 12), bytes.slice(12)]);
      if (limit === bytes.byteLength) assert.deepEqual(await readRequestJson(request, context, limit), { value: "中文" });
      else await assert.rejects(readRequestJson(request, context, limit), RequestBodyTooLargeError);
    } finally { context.dispose(); }
  }
});

test("inbound actual-byte guard ignores missing/false Content-Length in either direction", async () => {
  const bytes = new TextEncoder().encode('{"value":1}');
  for (const headers of [{}, { "content-length": "1" }, { "content-length": "99999999" }] as Record<string, string>[]) {
    const context = createRequestContext();
    try {
      assert.deepEqual(await readRequestJson(incoming([bytes], headers), context, bytes.length), { value: 1 });
      await assert.rejects(readRequestJson(incoming([bytes], headers), context, bytes.length - 1), RequestBodyTooLargeError);
    } finally { context.dispose(); }
  }
});

test("inbound oversize cancels reader, releases its lock and never pulls subsequent chunks", async () => {
  const context = createRequestContext(); let pulls = 0; let cancelled = 0;
  const request = new Request("http://localhost/", { method: "POST", duplex: "half", body: new ReadableStream({
    pull(controller) { pulls++; controller.enqueue(new Uint8Array(33)); }, cancel() { cancelled++; },
  }, { highWaterMark: 0 }) } as RequestInit);
  try {
    await assert.rejects(readRequestJson(request, context, 32), RequestBodyTooLargeError);
    assert.equal(pulls, 1); assert.equal(cancelled, 1); assert.equal(request.body?.locked, false);
  } finally { context.dispose(); }
});

test("inbound 413 aborts the request context before business continuation", async () => {
  let businessCalls = 0;
  let contextReason: unknown;
  const request = incoming([new Uint8Array(STAGE_A_POLICY.maxRequestBytes + 1)]);
  const response = await withRequestLifecycle(request, async (context, policy) => {
    try { await readRequestJson(request, context, policy.maxRequestBytes); }
    finally { contextReason = context.signal.reason; }
    businessCalls++;
    return Response.json({});
  });
  assert.equal(response.status, 413); assert.equal(businessCalls, 0);
  assert.ok(contextReason instanceof RequestBodyTooLargeError);
});

test("60-second request candidate is independent of per-call 8-second timers", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const context = createRequestContext(undefined, STAGE_A_POLICY.requestTimeoutMs);
  const pending = abortable(new Promise<void>(() => {}), context.signal);
  const rejected = assert.rejects(pending, code("REQUEST_DEADLINE_EXCEEDED"));
  t.mock.timers.tick(59999); assert.equal(context.signal.aborted, false);
  t.mock.timers.tick(1); await rejected; context.dispose();
});
