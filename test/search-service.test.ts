import assert from "node:assert/strict";
import test from "node:test";
import { AmapApiError } from "../src/amap/client.js";
import { CATEGORIES } from "../src/amap/categories.js";
import { executeResolvedSearch, executeSearch, executeSecondPageSearch } from "../src/search/service.js";
import type { GeocodedPlace, PlacePage } from "../src/amap/types.js";

const centre: GeocodedPlace = { query: "深圳北站", formattedAddress: "深圳北站", province: "广东省", city: "深圳市", district: "龙华区", longitude: 114, latitude: 22, level: "兴趣点" };
const emptyPage: PlacePage = { places: [], pageNumber: 1, pageSize: 25, returnedCount: 0, mayHaveNextApiPage: false };

test("product search uses page 1/25, preserves order and isolates structured AMap errors", async () => {
  const selected = [CATEGORIES[1]!, CATEGORIES[0]!];
  const optionsSeen: unknown[] = [];
  const response = await executeSearch({ query: centre.query, categoryIds: selected.map((item) => item.key), radiusMeters: 3000 }, {
    geocode: async () => centre,
    searchNearby: async (_location, category, options) => {
      optionsSeen.push(options);
      if (category.key === selected[0]!.key) throw new AmapApiError("limited", "CUQPS_HAS_EXCEEDED_THE_LIMIT", "10021");
      return emptyPage;
    }
  }, async () => {});
  assert.deepEqual(response.categories.map((item) => item.category.key), selected.map((item) => item.key));
  assert.equal(response.categories[0]?.status, "error");
  assert.equal(response.categories[0]?.error?.info, null);
  assert.equal(response.categories[0]?.error?.infocode, null);
  assert.equal(response.categories[0]?.error?.message.includes("limited"), false);
  assert.equal(response.categories[1]?.status, "empty");
  assert.equal(response.status, "partial success");
  assert.deepEqual(optionsSeen, [{ radiusMeters: 3000, pageNumber: 1, pageSize: 25 }, { radiusMeters: 3000, pageNumber: 1, pageSize: 25 }]);
});

test("a full raw page of rejected transit children stays eligible for page 2", async () => {
  const response = await executeResolvedSearch({
    center: { longitude: centre.longitude, latitude: centre.latitude },
    resolvedLocation: centre,
    categoryIds: ["subway"],
    radiusMeters: 3000,
  }, {
    geocode: async () => centre,
    searchNearby: async () => ({ places: [], pageNumber: 1, pageSize: 25, returnedCount: 25, mayHaveNextApiPage: true }),
  }, async () => {});
  assert.equal(response.categories[0]?.status, "success");
  assert.equal(response.categories[0]?.places.length, 0);
  assert.equal(response.categories[0]?.page?.returnedCount, 25);
});

test("confirmed search uses the resolved centre without geocoding again", async () => {
  let geocodeCalled = false;
  const response = await executeResolvedSearch({
    center: { longitude: centre.longitude, latitude: centre.latitude },
    resolvedLocation: centre,
    categoryIds: [CATEGORIES[0]!.key],
    radiusMeters: 3000,
  }, {
    geocode: async () => { geocodeCalled = true; return centre; },
    searchNearby: async (location) => {
      assert.deepEqual(location, centre);
      return emptyPage;
    },
  }, async () => {});
  assert.equal(geocodeCalled, false);
  assert.equal(response.status, "success");
});

test("second-page search makes one direct provider call with fixed page 2/25", async () => {
  const category = CATEGORIES[2]!;
  const center = { longitude: 114.029, latitude: 22.609 };
  const page: PlacePage = { places: [], pageNumber: 2, pageSize: 25, returnedCount: 0, mayHaveNextApiPage: false };
  const calls: unknown[] = [];
  const response = await executeSecondPageSearch({ center, categoryId: category.key, radiusMeters: 2000 }, {
    geocode: async () => { throw new Error("second-page search must not geocode"); },
    searchNearby: async (receivedCenter, receivedCategory, options) => {
      calls.push({ receivedCenter, receivedCategory, options });
      return page;
    },
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    receivedCenter: center,
    receivedCategory: category,
    options: { radiusMeters: 2000, pageNumber: 2, pageSize: 25 },
  });
  assert.deepEqual(response, { categoryId: category.key, page });
});

test("second-page search propagates provider failure without retry", async () => {
  let calls = 0;
  const failure = new AmapApiError("limited", "CUQPS_HAS_EXCEEDED_THE_LIMIT", "10021");
  await assert.rejects(executeSecondPageSearch({ center: { longitude: 114, latitude: 22 }, categoryId: CATEGORIES[0]!.key, radiusMeters: 3000 }, {
    geocode: async () => { throw new Error("second-page search must not geocode"); },
    searchNearby: async () => { calls += 1; throw failure; },
  }), (error: unknown) => error === failure);
  assert.equal(calls, 1);
});
