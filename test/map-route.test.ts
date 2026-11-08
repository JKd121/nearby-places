import assert from "node:assert/strict";
import { mock, test } from "node:test";

let authorized = true, requests = 0, limited = false;
mock.module("../src/identity/service.js", { namedExports: { resolveRequestIdentity: async () => {
  if (!authorized) throw new Error("unauthorized");
  return { kind: "account", sessionId: "test-session" };
} } });
mock.module("../src/identity/rate.js", { namedExports: { requireRate: async () => { if (limited) throw new Error("rate-limited"); } } });
mock.module("../src/identity/security.js", { namedExports: { fingerprint: () => "test-fingerprint" } });
mock.module("../src/server/http.js", { namedExports: {
  jsonError: (message: string, status: number, code?: string) => Response.json({ error: { message, code } }, { status }),
  mapServerError: () => Response.json({ error: { message: "身份或速率校验失败" } }, { status: 403 }),
} });
mock.module("../src/amap/transport.js", { namedExports: { requestMapAsset: async (url: URL) => { requests++; return Response.json({ path: url.pathname }); } } });

const configRoute = await import("../app/api/maps/config/route.js");
const proxyRoute = await import("../app/api/maps/[...path]/route.js");
const context = (path = ["_AMapService", "v4", "map", "styles"]) => ({ params: Promise.resolve({ path }) });

test("map routes require identity, hide the security code, restrict paths and enforce rate checks", async () => {
  const previousKey = process.env.AMAP_JS_API_KEY, previousCode = process.env.AMAP_JS_SECURITY_CODE;
  try {
    delete process.env.AMAP_JS_API_KEY; delete process.env.AMAP_JS_SECURITY_CODE;
    assert.equal((await configRoute.GET(new Request("http://localhost/api/maps/config"))).status, 503);
    process.env.AMAP_JS_API_KEY = "a".repeat(32); process.env.AMAP_JS_SECURITY_CODE = "b".repeat(32);
    const config = await configRoute.GET(new Request("http://localhost/api/maps/config"));
    assert.equal(config.headers.get("cache-control"), "private, no-store");
    const body = await config.text(); assert.ok(body.includes("a".repeat(32))); assert.ok(!body.includes("b".repeat(32)));
    authorized = false;
    assert.equal((await configRoute.GET(new Request("http://localhost/api/maps/config"))).status, 403);
    assert.equal((await proxyRoute.GET(new Request("http://localhost/api/maps/_AMapService/v4/map/styles"), context())).status, 403);
    assert.equal(requests, 0); authorized = true;
    const denied = await proxyRoute.GET(new Request("http://localhost/api/maps/_AMapService/v5/place/around"), context(["_AMapService", "v5", "place", "around"]));
    assert.equal(denied.status, 400); assert.equal(requests, 0);
    assert.equal((await proxyRoute.GET(new Request("http://localhost/api/maps/_AMapService/v4/map/styles", { headers: { "sec-fetch-site": "cross-site" } }), context())).status, 403);
    limited = true;
    assert.equal((await proxyRoute.GET(new Request("http://localhost/api/maps/_AMapService/v4/map/styles"), context())).status, 403);
    assert.equal(requests, 0); limited = false;
    assert.equal((await proxyRoute.GET(new Request("http://localhost/api/maps/_AMapService/v4/map/styles"), context())).status, 200);
    assert.equal(requests, 1);
  } finally {
    if (previousKey === undefined) delete process.env.AMAP_JS_API_KEY; else process.env.AMAP_JS_API_KEY = previousKey;
    if (previousCode === undefined) delete process.env.AMAP_JS_SECURITY_CODE; else process.env.AMAP_JS_SECURITY_CODE = previousCode;
  }
});
