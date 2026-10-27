import assert from "node:assert/strict";
import test from "node:test";
import { inspectSource, checkProject } from "../scripts/check-amap-boundary.mjs";

test("every production module respects the transport boundary", () => assert.deepEqual(checkProject(), []));
for (const source of [
  'const f = fetch; f("https://example.com");',
  'globalThis.fetch("https://example.com");',
  'globalThis["fetch"]("https://example.com");',
  'import { request } from "node:https";',
  'const http = require("undici");',
  'await import("axios");',
  'import client from "some-new-network-client";',
  'const f = Reflect.get(globalThis, "fetch");',
  'await import(moduleName);',
  'import { createAmapClient } from "../amap/client.js";',
  'import helper from "../../scripts/spikes/location-intent-spike.js";',
  'const url = "https://restapi.amap.com/v5/place/around";',
  'createAmapTransport(myFetch);',
]) test(`boundary rejects ${source}`, () => assert.ok(inspectSource("src/server/new-feature.ts", source).length));
test("fetchImpl cannot run directly inside either business client", () => {
  for (const path of ["src/amap/client.ts", "src/location/provider.ts"]) {
    assert.ok(inspectSource(path, 'function run(fetchImpl: typeof fetch) { return fetchImpl(url); }').length);
    assert.deepEqual(inspectSource(path, 'function run(fetchImpl?: typeof fetch) { return createAmapTransport(fetchImpl); }'), []);
  }
});
test("only transport can execute fetch with a signal", () => assert.deepEqual(inspectSource("src/amap/transport.ts", 'fetchImpl(url, { signal });'), []));
test("browser modules cannot contain a direct AMap endpoint", () => assert.ok(inspectSource("src/web/new.ts", 'fetch("https://restapi.amap.com/v3/geocode/geo")').length));
test("server factories cannot omit PostgreSQL admission", () => {
  assert.ok(inspectSource("src/server/amap.ts", 'createAmapTransport(undefined, { policy });').length);
  assert.deepEqual(inspectSource("src/server/amap.ts", 'createAmapTransport(undefined, { policy, beforeAttempt: getServerAdmission("primary") });'), []);
});
