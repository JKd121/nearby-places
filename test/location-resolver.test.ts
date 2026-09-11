import assert from "node:assert/strict";
import test from "node:test";
import { AmapApiError } from "../src/amap/client.js";
import { resolveLocation } from "../src/location/resolver.js";
import type { LocationResolverProvider, ProviderPlace } from "../src/location/types.js";

const place = (overrides: Partial<ProviderPlace> = {}): ProviderPlace => ({
  id: "id",
  name: "深圳北站",
  type: "交通设施服务;火车站;火车站",
  typeCode: "150200",
  province: "广东省",
  city: "深圳市",
  district: "龙华区",
  address: "致远中路",
  location: { longitude: 114.03, latitude: 22.61 },
  providerRank: 1,
  ...overrides,
});

function provider(overrides: Partial<LocationResolverProvider> = {}): LocationResolverProvider {
  return {
    geocode: async () => ({ query: "address", formattedAddress: "广东省深圳市龙华区致远中路28号", province: "广东省", city: "深圳市", district: "龙华区", level: "门址", longitude: 114.03, latitude: 22.61 }),
    searchPlaceCandidates: async () => [place()],
    ...overrides,
  };
}

test("PLACE_QUERY preserves rawQuery, provider order, and requires confirmation", async () => {
  const calls: string[] = [];
  const result = await resolveLocation("澜庭酒店 深圳罗湖", provider({ searchPlaceCandidates: async (query) => { calls.push(query); return [place({ name: "澜庭酒店(深圳东门晒布地铁站店)" }), place({ name: "另一家酒店", providerRank: 2 })]; } }));
  assert.deepEqual(calls, ["澜庭酒店 深圳罗湖"]);
  assert.equal(result.status, "needs_confirmation");
  assert.deepEqual(result.status === "needs_confirmation" ? result.candidates.map((candidate) => candidate.name) : [], ["澜庭酒店(深圳东门晒布地铁站店)", "另一家酒店"]);
});

test("PLACE_QUERY empty and malformed locations are safe", async () => {
  const result = await resolveLocation("深圳北站", provider({ searchPlaceCandidates: async () => [place({ location: null }), place({ id: null, name: null })] }));
  assert.equal(result.status, "needs_confirmation");
  assert.equal(result.status === "needs_confirmation" ? result.candidates[0]?.name : "", "未命名地点");
  const empty = await resolveLocation("维也纳酒店", provider({ searchPlaceCandidates: async () => [] }));
  assert.deepEqual(empty, { status: "not_found", candidates: [] });
});

test("ADDRESS_QUERY uses geocode and confirms a valid address", async () => {
  let poiCalled = false;
  const result = await resolveLocation("香港特别行政区九龙塘达之路83号", provider({ searchPlaceCandidates: async () => { poiCalled = true; return []; } }));
  assert.equal(result.status, "confirmed");
  assert.equal(result.status === "confirmed" ? result.location.placeType : "", "门址");
  assert.equal(poiCalled, false);
});

test("ADDRESS_QUERY with no geocode result is not_found and does not use POI fallback", async () => {
  let poiCalled = false;
  const result = await resolveLocation("深圳市龙华区民治街道致远中路28号", provider({ geocode: async () => null, searchPlaceCandidates: async () => { poiCalled = true; return []; } }));
  assert.deepEqual(result, { status: "not_found", candidates: [] });
  assert.equal(poiCalled, false);
});

test("provider failures remain typed errors", async () => {
  const failure = new AmapApiError("POI failed", "CUQPS_HAS_EXCEEDED_THE_LIMIT", "10021");
  await assert.rejects(() => resolveLocation("深圳北站", provider({ searchPlaceCandidates: async () => { throw failure; } })), (error: unknown) => error === failure && error instanceof AmapApiError && error.info === "CUQPS_HAS_EXCEEDED_THE_LIMIT" && error.infocode === "10021");
});
