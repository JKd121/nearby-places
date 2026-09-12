import assert from "node:assert/strict";
import test from "node:test";
import { CATEGORIES } from "../src/amap/categories.js";
import type { CategorySearchResult, Place } from "../src/amap/types.js";
import type { SearchResponse } from "../src/search/contracts.js";
import { buildAmapMarkerUrl } from "../src/web/location-links.js";
import {
  ALLOWED_RADIUS_METERS,
  CATEGORY_GROUPS,
  clearCategories,
  ensureValidSortMode,
  formatCost,
  formatDistance,
  formatRating,
  getAllowedSortModes,
  getAvailableFilters,
  getGroupSelection,
  getInitialVisibleCount,
  getNextVisibleCount,
  getPlacesForFilter,
  mergeSuccessfulPlaces,
  resetSearchView,
  selectAllCategories,
  toggleCategory,
  toggleGroup,
  truncateTag,
} from "../src/web/logic.js";

const place = (id: string, category: Place["category"], distanceMeters = 100): Place => ({
  id, name: id, category, longitude: 114, latitude: 22, distanceMeters, distanceSource: "amap", amapDistanceMeters: distanceMeters, computedDistanceMeters: distanceMeters, type: null, typecode: null, cost: null, rating: null, tag: null, address: "",
});
const result = (category: Place["category"], status: CategorySearchResult["status"], places: Place[] = []): CategorySearchResult => ({ category: CATEGORIES.find((item) => item.key === category)!, status, places, page: null, error: status === "error" ? { message: "failed", info: "x", infocode: "1" } : null });
const response: SearchResponse = { resolvedLocation: { query: "x", formattedAddress: "x", province: null, city: null, district: null, level: null, longitude: 114, latitude: 22 }, categories: [result("hotpot", "success", [place("same", "hotpot"), place("hotpot-2", "hotpot")]), result("bakery", "success", [place("same", "bakery"), place("bakery-2", "bakery")]), result("gym", "error")], status: "partial success" };

test("category and group selection preserves canonical order", () => {
  assert.deepEqual(toggleCategory(["hotel", "hotpot"], "hotel"), ["hotpot"]);
  assert.deepEqual(toggleCategory(["hotel"], "gym"), ["hotel", "gym"]);
  const food = CATEGORY_GROUPS.find((group) => group.key === "food")!.categoryIds;
  assert.equal(getGroupSelection(["hotpot"], food), "partial");
  assert.deepEqual(toggleGroup(["hotpot"], food), ["hotpot", "bakery", "dessert"]);
  assert.deepEqual(toggleGroup(food, food), []);
  assert.deepEqual(selectAllCategories(), CATEGORIES.map((category) => category.key));
  assert.deepEqual(clearCategories(), []);
});

test("allowed radii and stale view reset are explicit", () => {
  assert.deepEqual(ALLOWED_RADIUS_METERS, [1000, 2000, 3000, 5000]);
  assert.deepEqual(resetSearchView(), { activeFilter: "all", sortMode: "distance-asc", visibleCount: 20 });
});

test("filters include searched empty/error categories and All deduplicates by id", () => {
  assert.deepEqual(getAvailableFilters(response), ["all", "hotpot", "bakery", "gym"]);
  assert.deepEqual(mergeSuccessfulPlaces(response.categories).map((item) => item.id), ["same", "hotpot-2", "bakery-2"]);
  assert.deepEqual(getPlacesForFilter(response, "gym"), []);
});

test("sort modes and fallback follow category policy", () => {
  assert.deepEqual(getAllowedSortModes("all", ["hotpot"]), ["distance-asc", "rating-desc", "cost-asc", "cost-desc"]);
  assert.deepEqual(getAllowedSortModes("all", ["bakery"]), ["distance-asc", "rating-desc", "cost-asc", "cost-desc"]);
  assert.deepEqual(getAllowedSortModes("all", ["dessert"]), ["distance-asc", "rating-desc", "cost-asc", "cost-desc"]);
  assert.deepEqual(getAllowedSortModes("all", ["ktv"]), ["distance-asc", "rating-desc", "cost-asc", "cost-desc"]);
  assert.deepEqual(getAllowedSortModes("all", ["hotel"]), ["distance-asc", "rating-desc"]);
  assert.deepEqual(getAllowedSortModes("all", ["gym"]), ["distance-asc", "rating-desc"]);
  assert.deepEqual(getAllowedSortModes("all", ["hotpot", "hotel"]), ["distance-asc", "rating-desc"]);
  assert.deepEqual(getAllowedSortModes("hotpot"), ["distance-asc", "rating-desc", "cost-asc", "cost-desc"]);
  assert.deepEqual(getAllowedSortModes("gym"), ["distance-asc", "rating-desc"]);
  assert.equal(ensureValidSortMode("cost-asc", "gym", ["hotpot", "hotel"]), "distance-asc");
  assert.equal(ensureValidSortMode("cost-asc", "hotpot", ["hotpot", "hotel"]), "cost-asc");
});

test("mixed All stays restricted when a selected category is empty or errors", () => {
  // The scope is the submitted request, not the count of successful categories.
  assert.deepEqual(getAllowedSortModes("all", ["hotpot", "hotel"]), ["distance-asc", "rating-desc"]);
});

test("visible count follows single-category and All reveal limits", () => {
  assert.equal(getInitialVisibleCount("hotpot"), 10);
  assert.equal(getNextVisibleCount("hotpot", 10, 25), 20);
  assert.equal(getNextVisibleCount("hotpot", 20, 25), 25);
  assert.equal(getNextVisibleCount("hotpot", 20, 21), 21);
  assert.equal(getInitialVisibleCount("all"), 20);
  assert.equal(getNextVisibleCount("all", 20, 55), 40);
  assert.equal(getNextVisibleCount("all", 40, 55), 55);
});

test("formatters are null-safe and follow category cost policy", () => {
  assert.equal(formatDistance(620), "620 m");
  assert.equal(formatDistance(1600), "1.6 km");
  assert.equal(formatDistance(Number.NaN), "暂无距离");
  assert.equal(formatRating(4.6), "★ 4.6");
  assert.equal(formatRating(null), "暂无评分");
  assert.equal(formatCost("hotel", 100), null);
  assert.equal(formatCost("hotpot", 88), "人均 ¥88");
  assert.equal(formatCost("dessert", 42), "参考消费 ¥42");
  assert.equal(formatCost("gym", 120), "参考消费 ¥120");
  assert.equal(formatCost("gym", null), null);
  assert.equal(truncateTag("潮汕牛肉, 牛肉火锅, 大排档, 其他"), "潮汕牛肉 · 牛肉火锅 · 大排档");
  assert.equal(truncateTag(null), null);
});

test("AMap marker URL encodes names and contains no secret", () => {
  const rawName = "深圳北站 / A&B (北广场)";
  const result = buildAmapMarkerUrl({ longitude: 114.025796, latitude: 22.608443, name: rawName });
  assert.ok(result);
  const url = new URL(result);
  assert.equal(url.protocol, "https:");
  assert.equal(url.hostname, "uri.amap.com");
  assert.equal(url.pathname, "/marker");
  assert.equal(url.searchParams.get("position"), "114.025796,22.608443");
  assert.equal(url.searchParams.get("name"), rawName);
  assert.equal(url.searchParams.get("src"), "place-aggregator");
  assert.equal(url.searchParams.get("coordinate"), "gaode");
  assert.equal(url.searchParams.get("callnative"), "0");
  assert.equal(url.search.includes("AMAP_WEB_SERVICE_KEY"), false);
  assert.equal(url.searchParams.has("key"), false);
});

test("AMap marker URL accepts geographic boundaries", () => {
  assert.ok(buildAmapMarkerUrl({ longitude: -180, latitude: -90, name: "南端" }));
  assert.ok(buildAmapMarkerUrl({ longitude: 180, latitude: 90, name: "北端" }));
});

test("AMap marker URL rejects invalid coordinates without throwing", () => {
  for (const place of [
    { longitude: 180.001, latitude: 22, name: "越界经度" },
    { longitude: -180.001, latitude: 22, name: "越界经度" },
    { longitude: 114, latitude: 90.001, name: "越界纬度" },
    { longitude: 114, latitude: -90.001, name: "越界纬度" },
    { longitude: Number.NaN, latitude: 22, name: "NaN" },
    { longitude: 114, latitude: Number.POSITIVE_INFINITY, name: "Infinity" },
  ]) assert.equal(buildAmapMarkerUrl(place), null);
});
