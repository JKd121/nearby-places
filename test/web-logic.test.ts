import assert from "node:assert/strict";
import test from "node:test";
import { CATEGORIES } from "../src/amap/categories.js";
import type { CategorySearchResult, Place, PlacePage } from "../src/amap/types.js";
import type { SearchResponse } from "../src/search/contracts.js";
import { getCategoryCounts } from "../src/web/logic.js";
import { isCategoryCompleted } from "../src/search/status.js";
import { buildAmapMarkerUrl } from "../src/web/location-links.js";
import {
  ALLOWED_RADIUS_METERS,
  CATEGORY_GROUPS,
  clearCategories,
  ensureValidSortMode,
  getBusinessHoursDisplay,
  formatCost,
  formatDistance,
  formatRating,
  getAllowedSortModes,
  getAvailableFilters,
  getGroupSelection,
  getInitialVisibleCount,
  getNextVisibleCount,
  getPlaceRenderKey,
  getEmptyStateMessage,
  getPlacesForFilter,
  canRequestSecondProviderPage,
  mergeSuccessfulPlaces,
  mergeProviderPagePlaces,
  mergeProviderPageResult,
  resetSearchView,
  resolveProviderPageCategory,
  selectAllCategories,
  toggleCategory,
  toggleGroup,
  truncateTag,
  isTransitCategory,
} from "../src/web/logic.js";

const place = (id: string, category: Place["category"], distanceMeters = 100): Place => ({
  id, parentId: null, name: id, category, longitude: 114, latitude: 22, distanceMeters, distanceSource: "amap", amapDistanceMeters: distanceMeters, computedDistanceMeters: distanceMeters, type: null, typecode: null, cost: null, rating: null, tag: null, openTimeToday: null, openTimeWeek: null, address: "",
});
const result = (category: Place["category"], status: CategorySearchResult["status"], places: Place[] = []): CategorySearchResult => ({ category: CATEGORIES.find((item) => item.key === category)!, status, places, page: null, error: status === "error" ? { message: "failed", info: "x", infocode: "1" } : null });
const response: SearchResponse = { resolvedLocation: { query: "x", formattedAddress: "x", province: null, city: null, district: null, level: null, longitude: 114, latitude: 22 }, categories: [result("hotpot", "success", [place("same", "hotpot"), place("hotpot-2", "hotpot")]), result("bakery", "success", [place("same", "bakery"), place("bakery-2", "bakery")]), result("gym", "error")], status: "partial success" };

test("skipped categories are neither completed nor eligible for page two", () => {
  const skipped = result("hotel", "skipped");
  const partial = [result("hotel", "empty"), result("mall", "error"), skipped];
  assert.deepEqual(getCategoryCounts(partial), { completed: 1, failed: 1, skipped: 1 });
  assert.equal(isCategoryCompleted(skipped.status), false);
  assert.equal(partial.some(item => isCategoryCompleted(item.status)), true);
  assert.equal([result("mall", "error"), skipped].some(item => isCategoryCompleted(item.status)), false);
  assert.equal(canRequestSecondProviderPage(skipped), false);
});

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

test("filters include searched empty/error categories and All deduplicates by exact non-empty id", () => {
  assert.deepEqual(getAvailableFilters(response), ["all", "hotpot", "bakery", "gym"]);
  assert.deepEqual(mergeSuccessfulPlaces(response.categories).map((item) => item.id), ["same", "hotpot-2", "bakery-2"]);
  assert.deepEqual(getPlacesForFilter(response, "gym"), []);
});

test("All aggregation preserves empty IDs and does not mutate source arrays", () => {
  const sameName = place("", "hotpot");
  const sameAddress = { ...sameName };
  const otherCategory = place("", "bakery");
  const duplicate = place("exact", "hotpot");
  const duplicateAgain = place("exact", "bakery");
  const categories = [
    result("hotpot", "success", [sameName, sameAddress, duplicate]),
    result("bakery", "success", [otherCategory, duplicateAgain]),
  ];
  const before = categories.map((item) => [...item.places]);

  assert.deepEqual(mergeSuccessfulPlaces(categories), [sameName, sameAddress, duplicate, otherCategory]);
  assert.deepEqual(categories.map((item) => item.places), before);
});

test("place render keys remain unique for multiple empty IDs", () => {
  assert.notEqual(getPlaceRenderKey(place("", "hotpot"), 0), getPlaceRenderKey(place("", "hotpot"), 1));
  assert.equal(getPlaceRenderKey(place("poi-1", "hotpot"), 0), "hotpot-poi-1");
});

test("business-hours display prefers today, falls back to week, and stays neutral when missing", () => {
  assert.equal(getBusinessHoursDisplay({ ...place("today", "hotpot"), openTimeToday: "10:00-22:00", openTimeWeek: "周一至周日" }), "今日营业：10:00-22:00");
  assert.equal(getBusinessHoursDisplay({ ...place("week", "hotpot"), openTimeToday: null, openTimeWeek: "周末 09:00-18:00" }), "营业时间：周末 09:00-18:00");
  assert.equal(getBusinessHoursDisplay({ ...place("none", "hotpot"), openTimeToday: " ", openTimeWeek: null }), "营业时间暂无");
});

test("provider page merge preserves empty IDs, removes exact duplicate IDs, and is immutable", () => {
  const pageOne = [place("same", "hotpot"), place("", "hotpot")];
  const pageTwo = [place("same", "hotpot"), place("new", "hotpot"), place("", "hotpot"), place("abc ", "hotpot")];
  const pageOneBefore = [...pageOne];
  const pageTwoBefore = [...pageTwo];

  assert.deepEqual(mergeProviderPagePlaces(pageOne, pageTwo).map((item) => item.id), ["same", "", "new", "", "abc "]);
  assert.deepEqual(pageOne, pageOneBefore);
  assert.deepEqual(pageTwo, pageTwoBefore);
});

test("provider page result replaces only the target category page and preserves the initial response", () => {
  const initial: SearchResponse = {
    ...response,
    categories: [
      { ...result("hotpot", "success", [place("first", "hotpot")]), page: { pageNumber: 1, pageSize: 25, returnedCount: 25, mayHaveNextApiPage: true } },
      result("bakery", "success", [place("bakery", "bakery")]),
    ],
  };
  const pageTwo: PlacePage = {
    places: [place("first", "hotpot"), { ...place("second", "hotpot"), openTimeToday: "11:00-23:00", openTimeWeek: "每日 11:00-23:00" }],
    pageNumber: 2,
    pageSize: 25,
    returnedCount: 2,
    mayHaveNextApiPage: false,
  };

  const merged = mergeProviderPageResult(initial, "hotpot", pageTwo);

  assert.deepEqual(merged.categories[0]?.places.map((item) => item.id), ["first", "second"]);
  assert.deepEqual([merged.categories[0]?.places[1]?.openTimeToday, merged.categories[0]?.places[1]?.openTimeWeek], ["11:00-23:00", "每日 11:00-23:00"]);
  assert.deepEqual(merged.categories[0]?.page, { pageNumber: 2, pageSize: 25, returnedCount: 2, mayHaveNextApiPage: false });
  assert.deepEqual(merged.categories[1], initial.categories[1]);
  assert.deepEqual(initial.categories[0]?.places.map((item) => item.id), ["first"]);
  assert.deepEqual(initial.categories[0]?.page, { pageNumber: 1, pageSize: 25, returnedCount: 25, mayHaveNextApiPage: true });
});

test("filtered transit pages become empty only after provider exhaustion", () => {
  const initial: SearchResponse = {
    ...response,
    categories: [{ ...result("subway", "success"), page: { pageNumber: 1, pageSize: 25, returnedCount: 25, mayHaveNextApiPage: true } }],
  };
  const merged = mergeProviderPageResult(initial, "subway", { places: [], pageNumber: 2, pageSize: 25, returnedCount: 0, mayHaveNextApiPage: false });
  assert.equal(merged.categories[0]?.status, "empty");
  assert.equal(merged.categories[0]?.places.length, 0);
});

test("provider page target uses submitted category IDs", () => {
  assert.equal(resolveProviderPageCategory("hotpot", ["hotpot", "hotel"]), "hotpot");
  assert.equal(resolveProviderPageCategory("all", ["hotpot"]), "hotpot");
  assert.equal(resolveProviderPageCategory("all", ["hotpot", "hotel"]), null);
});

test("page 2 eligibility requires a full successful page 1 and provider heuristic", () => {
  const fullPage = result("hotpot", "success", [place("one", "hotpot")]);
  fullPage.page = { pageNumber: 1, pageSize: 25, returnedCount: 25, mayHaveNextApiPage: true };
  assert.equal(canRequestSecondProviderPage(fullPage), true);
  fullPage.page = { pageNumber: 1, pageSize: 25, returnedCount: 24, mayHaveNextApiPage: true };
  assert.equal(canRequestSecondProviderPage(fullPage), false);
  fullPage.page = { pageNumber: 1, pageSize: 25, returnedCount: 25, mayHaveNextApiPage: false };
  assert.equal(canRequestSecondProviderPage(fullPage), false);
  fullPage.page = { pageNumber: 2, pageSize: 25, returnedCount: 25, mayHaveNextApiPage: true };
  assert.equal(canRequestSecondProviderPage(fullPage), false);
  assert.equal(canRequestSecondProviderPage(result("hotpot", "empty")), false);
  assert.equal(canRequestSecondProviderPage(result("hotpot", "error")), false);
  assert.equal(canRequestSecondProviderPage(null), false);
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
  assert.deepEqual(getAllowedSortModes("bus"), ["distance-asc"]);
  assert.deepEqual(getAllowedSortModes("subway"), ["distance-asc"]);
  assert.deepEqual(getAllowedSortModes("all", ["bus", "subway"]), ["distance-asc"]);
  assert.equal(ensureValidSortMode("rating-desc", "bus"), "distance-asc");
});

test("transit semantics stay separate from merchant semantics", () => {
  assert.equal(isTransitCategory("bus"), true);
  assert.equal(isTransitCategory("subway"), true);
  assert.equal(isTransitCategory("hotel"), false);
  assert.equal(getEmptyStateMessage("bus"), "当前范围内暂无公交站");
  assert.equal(getEmptyStateMessage("subway"), "当前范围内暂无地铁站");
  assert.equal(getEmptyStateMessage("hotel"), "该类别暂无附近结果。");
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
  assert.equal(getNextVisibleCount("hotpot", 25, 50), 35);
  assert.equal(getNextVisibleCount("hotpot", 35, 50), 45);
  assert.equal(getNextVisibleCount("hotpot", 45, 50), 50);
  assert.equal(getNextVisibleCount("hotpot", 45, 48), 48);
  assert.equal(getNextVisibleCount("hotpot", 50, 80), 50);
  assert.equal(getInitialVisibleCount("all"), 20);
  assert.equal(getNextVisibleCount("all", 20, 55), 40);
  assert.equal(getNextVisibleCount("all", 40, 55), 55);
  assert.equal(getNextVisibleCount("all", 25, 50), 45);
  assert.equal(getNextVisibleCount("all", 45, 50), 50);
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

test("transit marker URL prefers provider POI ID without changing coordinate fallback", () => {
  const result = buildAmapMarkerUrl({ id: "BV10244304", preferPoiId: true, longitude: 114.025796, latitude: 22.608443, name: "深圳北站(公交站)" });
  assert.ok(result);
  const url = new URL(result);
  assert.equal(url.searchParams.get("poiid"), "BV10244304");
  assert.equal(url.searchParams.get("position"), "114.025796,22.608443");
  const fallback = buildAmapMarkerUrl({ id: " ", preferPoiId: true, longitude: 114.025796, latitude: 22.608443, name: "无 ID 站点" });
  assert.ok(fallback);
  assert.equal(new URL(fallback).searchParams.has("poiid"), false);
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
