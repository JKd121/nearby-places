import assert from "node:assert/strict";
import test from "node:test";
import { AmapApiError } from "../src/amap/client.js";
import { CATEGORIES } from "../src/amap/categories.js";
import { executeResolvedSearch, executeSearch } from "../src/search/service.js";
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
  assert.equal(response.categories[0]?.error?.info, "CUQPS_HAS_EXCEEDED_THE_LIMIT");
  assert.equal(response.categories[0]?.error?.infocode, "10021");
  assert.equal(response.categories[1]?.status, "empty");
  assert.equal(response.status, "partial success");
  assert.deepEqual(optionsSeen, [{ radiusMeters: 3000, pageNumber: 1, pageSize: 25 }, { radiusMeters: 3000, pageNumber: 1, pageSize: 25 }]);
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
