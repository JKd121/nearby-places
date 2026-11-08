import assert from "node:assert/strict";
import test from "node:test";
import { CATEGORIES } from "../src/amap/categories.js";
import type { CategoryKey, CategorySearchResult, Place } from "../src/amap/types.js";
import { clusterAppearance, clusterSummary, entryKey, mapPlaces, sameCoordinates, selectionFor, viewportPlaces } from "../src/web/map/model.js";
import { mapConfiguration, mapProxyTarget } from "../src/server/map-config.js";
import { requestMapAsset } from "../src/amap/transport.js";
import { categoryPaths } from "../src/web/ui/category-shapes.js";

test("all ten subcategories have distinct pictograms and five parent groups have icons", () => {
  const icons = CATEGORIES.map(category => categoryPaths(category.key).join("|"));
  assert.equal(new Set(icons).size, 10);
  for (const key of ["stay", "shopping", "food", "entertainment", "transit"] as const) assert.ok(categoryPaths(key).length > 0);
});

function place(id: string, category: CategoryKey = "hotel", longitude = 114.03, latitude = 22.61): Place {
  return { id, category, longitude, latitude, parentId: null, name: id, address: "测试地址", distanceMeters: 20,
    distanceSource: "amap", amapDistanceMeters: 20, computedDistanceMeters: 20, type: null, typecode: null,
    cost: null, rating: null, tag: null, openTimeToday: null, openTimeWeek: null };
}
function result(key: CategoryKey, places: Place[]): CategorySearchResult {
  return { category: CATEGORIES.find(item => item.key === key)!, places, status: "success", error: null, page: null };
}

test("map deduplicates shared POI identities and preserves all category references and empty IDs", () => {
  const points = mapPlaces([result("hotel", [place("same"), place(""), place(""), place("same")]), result("mall", [place("same", "mall")])]);
  assert.equal(points.length, 3); assert.equal(points[0]!.entries.length, 2);
  assert.deepEqual(points[0]!.categories, ["hotel", "mall"]);
  assert.equal(selectionFor(points[0]!, "mall").entryKey, "mall:same");
  assert.equal(clusterSummary(points).hotel, 3); assert.equal(clusterSummary(points).mall, 1);
  assert.notEqual(entryKey(place(""), 1), entryKey(place(""), 2));
});

for (const count of [50, 250, 500, 1000]) test(`map fixture ${count}: unique entries, viewport buffer and stable identity`, () => {
  const points = mapPlaces([result("hotel", Array.from({ length: count }, (_, index) => place(String(index), "hotel", index, 20)))]);
  // Use valid geographic coordinates for the full fixture, project by ID for deterministic screen positions.
  const all = mapPlaces([result("hotel", Array.from({ length: count }, (_, index) => place(String(index), "hotel", 114 + index / 100000, 22.6)))]);
  assert.equal(all.length, count); assert.ok(points.length <= count);
  const view = viewportPlaces(all, 100, 100, point => ({ x: Number(point.entries[0]!.place.id), y: 50 }));
  assert.equal(view.visibleCount, Math.min(count, 101)); assert.equal(view.points.length, Math.min(count, 181));
  assert.equal(new Set(all.map(item => item.key)).size, count);
});

test("map retains overlapping coordinates, validates coordinates, and distinguishes single-category clusters", () => {
  const points = mapPlaces([result("hotel", [place("a"), place("b"), place("bad", "hotel", NaN)])]);
  assert.equal(points.length, 2); assert.ok(sameCoordinates(points));
  assert.equal(clusterAppearance(points).size, 32);
  const mixed = mapPlaces([result("mall", [place("c", "mall")])]);
  assert.notEqual(clusterAppearance(points).color, clusterAppearance([...points, ...mixed]).color);
});

const config = { key: "a".repeat(32), securityCode: "b".repeat(32) };
test("map configuration exposes no usable config until both credentials are present", () => {
  assert.equal(mapConfiguration({}), null);
  assert.equal(mapConfiguration({ AMAP_JS_API_KEY: config.key }), null);
  assert.deepEqual(mapConfiguration({ AMAP_JS_API_KEY: config.key, AMAP_JS_SECURITY_CODE: config.securityCode }), config);
});
test("map proxy allows only fixed SDK assets and overrides browser credentials", () => {
  const url = mapProxyTarget(["_AMapService", "v4", "map", "styles"], new URLSearchParams("key=bad&jscode=bad&callback=AMap.cb&styleid=normal"), config)!;
  assert.equal(url.hostname, "restapi.amap.com"); assert.equal(url.searchParams.get("key"), config.key);
  assert.equal(url.searchParams.get("jscode"), config.securityCode);
  const init = mapProxyTarget(["_AMapService", "v3", "log", "init"], new URLSearchParams("eventId=resource.load&s=rsv3&product=JsInit&platform=JS&t=123&resolution=1440*1000&mob=0&vt=1&dpr=1&scale=1&callback=jsonp_123_"), config);
  assert.equal(init?.pathname, "/v3/log/init");
  for (const path of [["v4", "map", "styles"], ["_AMapService", "v5", "place", "around"], ["_AMapService", "..", "v4", "map", "styles"]]) assert.equal(mapProxyTarget(path, new URLSearchParams(), config), null);
  for (const query of ["callback=alert(1)", "url=https://evil.test", "styleid=a&styleid=b", "styleid=" + "x".repeat(513)]) assert.equal(mapProxyTarget(["_AMapService", "v4", "map", "styles"], new URLSearchParams(query), config), null);
});
test("map transport has bounded bodies, redirects disabled, caller cancellation, and rejects POI endpoints", async () => {
  const url = mapProxyTarget(["_AMapService", "v3", "log", "init"], new URLSearchParams(), config)!;
  const controller = new AbortController();
  const response = await requestMapAsset(url, controller.signal, async (_url, options) => {
    assert.equal(options?.redirect, "error"); assert.ok(options?.signal);
    return Response.json({ ok: true });
  });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), { ok: true });
  await assert.rejects(requestMapAsset(new URL("https://restapi.amap.com/v5/place/around"), controller.signal, async () => { throw new Error("should never call"); }));
  await assert.rejects(requestMapAsset(url, controller.signal, async () => new Response("a".repeat(1024 * 1024 + 1))));
  controller.abort(); await assert.rejects(requestMapAsset(url, controller.signal, async () => Response.json({})));
});
