import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { CATEGORIES } from "../src/amap/categories.js";
import { createLocationResolverProvider } from "../src/location/provider.js";
import { resolveLocation } from "../src/location/resolver.js";
import { executeResolvedSearch, searchCategoriesSequentially } from "../src/search/service.js";
import { createDiagnostics } from "../src/server/diagnostics/timer.js";
import { withDiagnostics } from "../src/server/diagnostics/request.js";
import { writeLog } from "../src/server/diagnostics/logger.js";
import { POST as search } from "../app/api/search/route.js";
import { POST as resolve } from "../app/api/resolve-location/route.js";

type Log = Record<string, unknown>;
const center = { query: "private-query", formattedAddress: "private-address", longitude: 114.123456, latitude: 22.654321, province: null, city: null, district: null, level: null };
const session = randomUUID();
function context() { return { requestId: randomUUID(), route: "/api/search", diagnosticSessionId: session }; }
const body = { center, resolvedLocation: center, categoryIds: ["bakery"], radiusMeters: 3000 as const };
const ok = () => new Response(JSON.stringify({ status: "1", pois: [{ id: "p1", name: "private-poi", location: "114.123456,22.654321", distance: "10" }] }));
function request(route: string, data: unknown, id: string = session) {
  return new Request(`https://example.test${route}`, { method: "POST", headers: { "content-type": "application/json", "x-diagnostic-session-id": id, "x-request-id": "untrusted-request-id" }, body: typeof data === "string" ? data : JSON.stringify(data) });
}
async function capture(run: (logs: Log[]) => Promise<void>, enabled: string | null = "true") {
  const saved = { info: console.info, warn: console.warn, error: console.error, enabled: process.env.PERF_LOG_ENABLED, key: process.env.AMAP_WEB_SERVICE_KEY, fetch: globalThis.fetch };
  const logs: Log[] = [];
  const collect = (line: unknown) => { logs.push(JSON.parse(String(line)) as Log); };
  console.info = collect; console.warn = collect; console.error = collect;
  if (enabled === null) delete process.env.PERF_LOG_ENABLED;
  else process.env.PERF_LOG_ENABLED = enabled;
  process.env.AMAP_WEB_SERVICE_KEY = "secret-api-key";
  try { await run(logs); }
  finally {
    console.info = saved.info; console.warn = saved.warn; console.error = saved.error;
    globalThis.fetch = saved.fetch;
    if (saved.enabled === undefined) delete process.env.PERF_LOG_ENABLED; else process.env.PERF_LOG_ENABLED = saved.enabled;
    if (saved.key === undefined) delete process.env.AMAP_WEB_SERVICE_KEY; else process.env.AMAP_WEB_SERVICE_KEY = saved.key;
  }
}

test("timers preserve values, sync throws and rejections, count elapsed time and deduplicate errors", async () => {
  await capture(async (logs) => {
    const diagnostics = createDiagnostics(context());
    const value = {};
    assert.equal(await diagnostics.measure("location.resolve", async () => { await new Promise((r) => setTimeout(r, 5)); return value; }), value);
    assert.equal(diagnostics.measureSync("amap.json", () => value), value);
    const failure = new Error("https://example.test?key=secret-api-key");
    await assert.rejects(diagnostics.measure("amap.fetch", () => { throw failure; }), (error) => error === failure);
    await assert.rejects(diagnostics.measure("location.resolve", async () => { throw failure; }), (error) => error === failure);
    assert.throws(() => diagnostics.measureSync("amap.json", () => { throw failure; }), (error) => error === failure);
    diagnostics.error(failure, "request", true);
    diagnostics.error(failure, "request", true);
    assert.equal(logs.filter((log) => log.event === "diagnostics.error").length, 1);
    assert.ok(Number(logs[0]!.durationMs) >= 4);
    assert.ok(logs.every((log) => Number(log.durationMs) >= 0));
    assert.equal(logs.at(-1)!.stage, "amap.fetch");
    assert.deepEqual(logs.at(-1)!.error, { type: "network", code: "UNEXPECTED_ERROR" });
    assert.equal(logs.at(-1)!.handled, true);
  });
});

test("default off (and non-true values) suppresses details but retains sanitized errors", async () => {
  for (const enabled of [null, "false", "1"]) await capture(async (logs) => {
    const diagnostics = createDiagnostics(context());
    await diagnostics.measure("amap.fetch", async () => 1);
    diagnostics.event("http.request.completed", "request", { status: 200 });
    assert.equal(logs.length, 0);
    diagnostics.error(new Error("secret-api-key"), "request", true);
    assert.equal(logs.length, 1);
    assert.equal(logs[0]!.event, "diagnostics.error");
    assert.equal(JSON.stringify(logs).includes("secret-api-key"), false);
  }, enabled);
});

test("logger allowlists fields, error codes and deployment metadata; a broken sink cannot break operations", async () => {
  await capture(async (logs) => {
    const privateText = "secret-api-key private-query private-address 114.123456 postgresql://secret cookie Authorization";
    writeLog(context(), "phase.completed", "amap.transform", { outcome: privateText, category: privateText, durationMs: Infinity, ...{ message: privateText, url: privateText } });
    const diagnostics = createDiagnostics(context());
    const error = Object.assign(new Error(privateText), { stack: privateText, info: privateText, infocode: privateText });
    diagnostics.annotate(error, "upstream_business", privateText);
    diagnostics.error(error, "amap.validate", true);
    assert.equal(JSON.stringify(logs).includes(privateText), false);
    assert.deepEqual(logs[1]!.error, { type: "upstream_business", code: "UNEXPECTED_ERROR" });
    console.info = console.warn = console.error = () => { throw new Error("sink failed"); };
    assert.equal(await diagnostics.measure("amap.fetch", async () => 42), 42);
    assert.equal(diagnostics.measureSync("amap.json", () => 43), 43);
    diagnostics.error(new Error("business"), "request", true);
    const failure = new Error("original");
    await assert.rejects(diagnostics.measure("amap.fetch", async () => { throw failure; }), (error) => error === failure);
  });
});

test("wrapper observes returned statuses, preserves response identity/headers and propagates thrown errors", async () => {
  await capture(async (logs) => {
    for (const status of [200, 400, 404, 500, 502]) {
      const response = new Response("unchanged", { status, headers: { "x-original": "yes" } });
      const handler = withDiagnostics("/api/search", async () => response);
      assert.equal(await handler(request("/api/search", {})), response);
      assert.equal(response.headers.get("x-original"), "yes");
      assert.equal(logs.at(-1)!.status, status);
    }
    const failure = new Error("private exception");
    await assert.rejects(withDiagnostics("/api/search", async () => { throw failure; })(request("/api/search", {})), (error) => error === failure);
    assert.equal(logs.at(-2)!.handled, false);
    assert.equal(logs.at(-1)!.status, 500);
  });
});

test("concurrent requests have isolated generated IDs; valid sessions correlate, invalid sessions are ignored", async () => {
  await capture(async (logs) => {
    const handler = withDiagnostics("/api/search", async (_request, diagnostics) => {
      await diagnostics.measure("amap.fetch", async () => { await new Promise((r) => setTimeout(r, 2)); });
      return new Response("ok");
    });
    await Promise.all([handler(request("/api/search", {})), handler(request("/api/search", {})), handler(request("/api/search", {}, "bad\tID")), handler(request("/api/search", {}, "a".repeat(1000)))]);
    const starts = logs.filter((log) => log.event === "http.request.started");
    assert.equal(new Set(starts.map((log) => log.requestId)).size, 4);
    assert.deepEqual(starts.map((log) => log.diagnosticSessionId), [session, session, undefined, undefined]);
    for (const start of starts) assert.equal(logs.filter((log) => log.requestId === start.requestId).length, 3);
    assert.equal(JSON.stringify(logs).includes("untrusted-request-id"), false);
  });
});

test("route integration: bakery output and headers match on/off, with separable upstream stages and no secrets", async () => {
  let baseline: unknown;
  let headers: unknown;
  for (const enabled of ["false", "true"]) await capture(async (logs) => {
    let count = 0;
    globalThis.fetch = async () => { count += 1; return ok(); };
    const response = await search(request("/api/search", body));
    assert.equal(response.status, 200);
    assert.equal(count, 1);
    const payload = await response.json();
    if (enabled === "false") { baseline = payload; headers = [...response.headers]; assert.equal(logs.length, 0); }
    else {
      assert.deepEqual(payload, baseline);
      assert.deepEqual([...response.headers], headers);
      for (const stage of ["amap.fetch", "amap.read", "amap.json", "amap.validate", "amap.transform", "search.category"]) assert.ok(logs.some((log) => log.stage === stage && log.event === "phase.completed"), stage);
      assert.equal(logs.some((log) => log.stage === "search.inter_category_wait"), false);
      assert.equal(logs.at(-1)!.event, "http.request.completed");
      assert.equal(new Set(logs.map((log) => log.requestId)).size, 1);
      for (const secret of ["secret-api-key", "private-query", "private-address", "private-poi", "114.123456", "22.654321"]) assert.equal(JSON.stringify(logs).includes(secret), false, secret);
    }
  }, enabled);
});

test("multi-category fake delay preserves strict calls, 500ms waits after failure, partial success and baseline result", async () => {
  await capture(async (logs) => {
    const categories = CATEGORIES.slice(0, 3);
    const failure = new Error("private provider error");
    async function run(enabled: boolean) {
      const calls: string[] = [];
      const result = await searchCategoriesSequentially(center, categories, async (_center, category) => {
        calls.push(category.key);
        if (category === categories[1]) throw failure;
        return { places: [], pageNumber: 1, pageSize: 25, returnedCount: 0, mayHaveNextApiPage: false };
      }, 3000, async (ms) => { calls.push(`wait:${ms}`); }, 500, enabled ? createDiagnostics(context()) : undefined);
      return { result, calls };
    }
    assert.deepEqual(await run(true), await run(false));
    assert.deepEqual((await run(false)).calls, [categories[0]!.key, "wait:500", categories[1]!.key, "wait:500", categories[2]!.key]);
    const waits = logs.filter((log) => log.stage === "search.inter_category_wait");
    assert.equal(waits.length, 2);
    assert.ok(waits.every((log) => log.scheduledMs === 500));
    assert.deepEqual(logs.filter((log) => log.event === "search.category.completed").map((log) => log.outcome), ["empty", "error", "empty"]);
    const result = await executeResolvedSearch({ ...body, categoryIds: ["bakery"] }, { geocode: async () => center, searchNearby: async () => { throw failure; } }, async () => {}, createDiagnostics(context()));
    assert.equal(result.status, "partial success");
    assert.ok(logs.some((log) => log.event === "search.completed" && log.outcome === "partial success"));
  });
});

test("one, three and eight categories keep exactly n calls and n-1 original fixed waits", async () => {
  await capture(async (logs) => {
    for (const count of [1, 3, 8]) {
      const sequence: string[] = [];
      const selected = CATEGORIES.slice(0, count);
      const before = logs.length;
      await searchCategoriesSequentially(center, selected, async (_center, category, options) => {
        sequence.push(category.key);
        assert.deepEqual(options, { radiusMeters: 3000, pageNumber: 1, pageSize: 25 });
        return { places: [], pageNumber: 1, pageSize: 25, returnedCount: 0, mayHaveNextApiPage: false };
      }, 3000, async (ms) => { sequence.push(`wait:${ms}`); }, 500, createDiagnostics(context()));
      assert.deepEqual(sequence, selected.flatMap((category, index) => index < count - 1 ? [category.key, "wait:500"] : [category.key]));
      assert.equal(logs.slice(before).filter((log) => log.stage === "search.inter_category_wait").length, count - 1);
    }
  });
});

test("upstream failure matrix retains response contracts and one normalized handled error per failure", async () => {
  const cases: [() => Promise<Response>, string, string][] = [
    [async () => { throw new TypeError("secret-api-key"); }, "network", "UNEXPECTED_ERROR"],
    [async () => Object.assign(new Response("{}"), { text: async () => { throw new TypeError("secret-api-key"); } }), "network", "UNEXPECTED_ERROR"],
    [async () => { throw new DOMException("secret-api-key", "TimeoutError"); }, "timeout", "UNEXPECTED_ERROR"],
    [async () => new Response("secret-api-key", { status: 503 }), "upstream_http", "503"],
    [async () => new Response("invalid secret-api-key"), "invalid_json", "UNEXPECTED_ERROR"],
    [async () => Response.json([]), "invalid_payload", "UNEXPECTED_ERROR"],
    [async () => Response.json({ status: "0", info: "secret-api-key", infocode: "10021" }), "upstream_business", "10021"],
  ];
  for (const [fetchImpl, type, code] of cases) for (const route of ["/api/search", "/api/resolve-location"]) await capture(async (logs) => {
    globalThis.fetch = fetchImpl;
    const response = route === "/api/search" ? await search(request(route, body)) : await resolve(request(route, { query: "海岸城" }));
    assert.equal(response.status, route === "/api/search" ? 200 : type === "network" || type === "timeout" ? 500 : 502);
    const errors = logs.filter((log) => log.event === "diagnostics.error");
    assert.equal(errors.length, 1, `${route} ${type}`);
    assert.deepEqual(errors[0]!.error, { type, code });
    assert.equal(errors[0]!.handled, true);
    assert.ok(Number(errors[0]!.durationMs) >= 0);
    assert.equal(JSON.stringify(logs).includes("secret-api-key"), false);
    assert.equal(logs.at(-1)!.status, response.status);
  });
});

test("resolver POI/geocode/not_found outcomes and cross-route session are observable", async () => {
  await capture(async (logs) => {
    let count = 0;
    globalThis.fetch = async () => { count += 1; return Response.json({ status: "1", pois: [], geocodes: [] }); };
    for (const query of ["海岸城", "深圳市南山区科技路1号"]) {
      const response = await resolve(request("/api/resolve-location", { query }));
      assert.deepEqual(await response.json(), { status: "not_found" });
    }
    assert.equal(count, 2);
    assert.ok(logs.some((log) => log.stage === "location.poi"));
    assert.ok(logs.some((log) => log.stage === "location.geocode"));
    assert.equal(logs.filter((log) => log.event === "diagnostics.error").length, 0);
    globalThis.fetch = async () => ok();
    await search(request("/api/search", body));
    assert.equal(new Set(logs.map((log) => log.requestId)).size, 3);
    assert.ok(logs.every((log) => log.diagnosticSessionId === session));
    const result = await resolveLocation("深圳市南山区科技路1号", createLocationResolverProvider("dummy", async () => Response.json({ status: "1", geocodes: [{ location: "114,22", formatted_address: "private-address" }] }), createDiagnostics(context())));
    assert.equal(result.status, "confirmed");
    globalThis.fetch = async () => Response.json({ status: "1", geocodes: [{ location: "114,22", formatted_address: "private-address" }] });
    assert.equal((await (await resolve(request("/api/resolve-location", { query: "深圳市南山区科技路1号" }))).json()).status, "confirmed");
    globalThis.fetch = async () => Response.json({ status: "1", pois: [{ id: "p1", name: "海岸城", location: "114,22", cityname: "深圳市" }] });
    assert.equal((await (await resolve(request("/api/resolve-location", { query: "海岸城" }))).json()).status, "needs_confirmation");
    assert.ok(logs.some((log) => log.event === "location.resolve.completed" && log.outcome === "confirmed"));
    assert.ok(logs.some((log) => log.event === "location.resolve.completed" && log.outcome === "needs_confirmation"));
  });
});

test("real routes keep validation and missing-key statuses with no upstream traffic", async () => {
  await capture(async (logs) => {
    globalThis.fetch = async () => { throw new Error("must not fetch"); };
    assert.equal((await search(request("/api/search", "{"))).status, 400);
    assert.equal((await resolve(request("/api/resolve-location", "{"))).status, 400);
    assert.equal((await search(request("/api/search", {}))).status, 400);
    delete process.env.AMAP_WEB_SERVICE_KEY;
    assert.equal((await search(request("/api/search", body))).status, 500);
    assert.equal((await resolve(request("/api/resolve-location", { query: "海岸城" }))).status, 500);
    assert.deepEqual(logs.filter((log) => log.event === "http.request.completed").map((log) => log.status), [400, 400, 400, 500, 500]);
    assert.equal(logs.filter((log) => log.event === "diagnostics.error").length, 5);
  });
});
