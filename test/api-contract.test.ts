import assert from "node:assert/strict";
import test from "node:test";
import "./admission-fixture.js";
const { POST: resolve } = await import("../app/api/resolve-location/route.js");
const { POST: search } = await import("../app/api/search/route.js");

const center = { longitude: 114.03, latitude: 22.61 };
const body = { center, radiusMeters: 3000, categoryIds: ["hotel", "mall"],
  resolvedLocation: { ...center, query: "合成测试中心", formattedAddress: "合成地址", province: null, city: null, district: null, level: null } };
function request(path: string, input: unknown) {
  return new Request(`http://localhost${path}`, { method: "POST", body: JSON.stringify(input) });
}

async function withProvider(fetchImpl: typeof fetch, run: () => Promise<void>) {
  const oldFetch = globalThis.fetch;
  const oldEnv = { ...process.env };
  try {
    globalThis.fetch = fetchImpl;
    Object.assign(process.env, { AMAP_WEB_SERVICE_KEY: "synthetic-api-key", AMAP_REQUEST_TIMEOUT_MS: "2000",
      AMAP_UPSTREAM_TIMEOUT_MS: "500", AMAP_MAX_RESPONSE_BYTES: "1048576", AMAP_HOST_MAX_DURATION_MS: "5000" });
    await run();
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key];
    Object.assign(process.env, oldEnv);
  }
}

test("resolve Route: candidate payload preserves query and coordinates; exactly one upstream call", async t => {
  const calls: URL[] = [];
  await withProvider(async input => {
    calls.push(new URL(String(input)));
    return Response.json({ status: "1", pois: [{ id: "synthetic-poi", name: "合成测试中心", location: "114.03,22.61", address: "合成地址", cityname: "测试市", adname: "测试区", type: "测试地点" }] });
  }, async () => {
    const response = await resolve(request("/api/resolve-location", { query: " 合成测试中心 " }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.status, "needs_confirmation");
    assert.deepEqual(result.candidates[0].location, center);
    assert.equal(result.candidates[0].name, "合成测试中心");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.searchParams.get("keywords"), "合成测试中心");
    assert.equal(JSON.stringify(result).includes("synthetic-api-key"), false);
    t.diagnostic('contract ' + JSON.stringify({ endpoint: "/api/resolve-location", status: response.status, upstreamCalls: calls.length }));
  });
});

test("resolve Route: empty provider response returns not_found; invalid input sends zero requests", async t => {
  let calls = 0;
  await withProvider(async () => { calls++; return Response.json({ status: "1", pois: [] }); }, async () => {
    assert.equal((await resolve(request("/api/resolve-location", { query: "" }))).status, 400);
    assert.equal(calls, 0);
    const response = await resolve(request("/api/resolve-location", { query: "合成测试中心" }));
    assert.deepEqual(await response.json(), { status: "not_found" });
    assert.equal(response.status, 200); assert.equal(calls, 1);
    t.diagnostic('contract ' + JSON.stringify({ endpoint: "/api/resolve-location", status: response.status, upstreamCalls: calls }));
  });
});

test("search Route: partial success retains successful places and sanitizes failed category", async t => {
  const calls: URL[] = [];
  await withProvider(async input => {
    const url = new URL(String(input)); calls.push(url);
    if (url.searchParams.get("types") === "100100") return Response.json({ status: "1", pois: [{ id: "synthetic-hotel", name: "合成酒店", location: "114.03,22.61", distance: "5" }] });
    return Response.json({ status: "0", info: "SECRET_PROVIDER", infocode: "10021" });
  }, async () => {
    const response = await search(request("/api/search", body));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.status, "partial success");
    assert.equal(result.categories[0].status, "success");
    assert.equal(result.categories[0].places[0].name, "合成酒店");
    assert.equal(result.categories[1].status, "error");
    assert.equal(calls.length, 2);
    for (const url of calls) {
      assert.equal(url.pathname, "/v5/place/around");
      assert.equal(url.searchParams.get("radius"), "3000");
      assert.equal(url.searchParams.get("page_num"), "1");
    }
    for (const forbidden of ["synthetic-api-key", "SECRET_PROVIDER", "10021", "restapi.amap.com"]) assert.equal(JSON.stringify(result).includes(forbidden), false);
    t.diagnostic('contract ' + JSON.stringify({ endpoint: "/api/search", status: response.status, upstreamCalls: calls.length }));
  });
});

test("search Route: empty results are a completed search, invalid categories have no upstream side effects", async () => {
  let calls = 0;
  await withProvider(async () => { calls++; return Response.json({ status: "1", pois: [] }); }, async () => {
    const invalid = await search(request("/api/search", { ...body, categoryIds: ["unknown"] }));
    assert.equal(invalid.status, 400); assert.equal(calls, 0);
    const response = await search(request("/api/search", { ...body, categoryIds: ["hotel"] }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.categories[0].status, "empty");
    assert.deepEqual(result.categories[0].places, []); assert.equal(calls, 1);
  });
});
