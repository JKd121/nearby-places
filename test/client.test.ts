import assert from "node:assert/strict";
import test from "node:test";
import { AmapApiError, createAmapClient } from "../src/amap/client.js";
import { CATEGORIES } from "../src/amap/categories.js";

const hotel = CATEGORIES[0]!;
const bus = CATEGORIES.find((category) => category.key === "bus")!;
const subway = CATEGORIES.find((category) => category.key === "subway")!;
function jsonResponse(body: unknown): Response { return new Response(JSON.stringify(body), { status: 200 }); }

test("types-only Around request, native distance, business nulls and page contract", async () => {
  let requestedUrl: URL | undefined;
  const fetchStub: typeof fetch = async (input) => {
    requestedUrl = new URL(input instanceof Request ? input.url : input.toString());
    return jsonResponse({ status: "1", count: "2", pois: [
      { id: "far", name: "Far Hotel", location: "114.020000,22.000000", distance: "20", type: "住宿服务;宾馆酒店", typecode: hotel.types[0], address: "Far Road", business: { cost: [], rating: "4.1", tag: "" } },
      { id: "near", name: "Near Hotel", location: "114.001000,22.000000", distance: "10", address: [], business: [] }
    ] });
  };
  const page = await createAmapClient("test-key", fetchStub).searchNearby(
    { longitude: 114, latitude: 22 }, hotel, { radiusMeters: 3_000, pageNumber: 1, pageSize: 25 }
  );
  assert.equal(requestedUrl?.pathname, "/v5/place/around");
  assert.equal(requestedUrl?.searchParams.get("types"), hotel.types.join("|"));
  assert.equal(requestedUrl?.searchParams.has("keywords"), false);
  assert.equal(requestedUrl?.searchParams.get("sortrule"), "distance");
  assert.equal(requestedUrl?.searchParams.get("show_fields"), "business");
  assert.equal(requestedUrl?.searchParams.get("page_size"), "25");
  assert.deepEqual(page.places.map((place) => place.id), ["near", "far"]);
  assert.equal(page.places[0]?.distanceSource, "amap");
  assert.equal(page.places[0]?.distanceMeters, 10);
  assert.ok((page.places[0]?.computedDistanceMeters ?? 0) > 0);
  assert.equal(page.places[0]?.cost, null);
  assert.equal(page.places[0]?.openTimeToday, null);
  assert.equal(page.places[0]?.openTimeWeek, null);
  assert.equal(page.places[1]?.rating, 4.1);
  assert.equal(page.places[1]?.typecode, hotel.types[0]);
  assert.equal(page.places[0]?.parentId, null);
  assert.equal(page.returnedCount, 2);
  assert.equal(page.mayHaveNextApiPage, false);
});

test("subway accepts exact station type, rejects exits, and preserves parent POI ID", async () => {
  const fetchStub: typeof fetch = async () => jsonResponse({ status: "1", pois: [
    { id: "exit", parent: "station", name: "深圳北站地铁站A口", location: "114.001,22", typecode: "150501" },
    { id: "station", parent: "hub", name: "深圳北站", location: "114.002,22", typecode: "150500" },
    { id: "missing-type", name: "Unknown", location: "114.003,22" },
  ] });
  const page = await createAmapClient("test-key", fetchStub).searchNearby(
    { longitude: 114, latitude: 22 }, subway, { radiusMeters: 3_000, pageNumber: 1, pageSize: 25 },
  );
  assert.deepEqual(page.places.map((place) => place.id), ["station"]);
  assert.equal(page.places[0]?.typecode, "150500");
  assert.equal(page.places[0]?.parentId, "hub");
  assert.equal(page.returnedCount, 3);
  assert.equal(page.mayHaveNextApiPage, false);
});

test("bus preserves provider variants without subway-style exact filtering", async () => {
  const typecodes = ["150700", "150701", "150702", "150703", "150704"];
  const fetchStub: typeof fetch = async () => jsonResponse({ status: "1", pois: typecodes.map((typecode, index) => ({
    id: `bus-${typecode}`,
    name: `站点-${typecode}`,
    location: `114.${String(index + 1).padStart(3, "0")},22`,
    typecode,
  })) });
  const page = await createAmapClient("test-key", fetchStub).searchNearby(
    { longitude: 114, latitude: 22 }, bus, { radiusMeters: 3_000, pageNumber: 1, pageSize: 25 },
  );
  assert.deepEqual(page.places.map((place) => place.typecode).sort(), typecodes.sort());
});

test("business hours preserve provider text and normalize missing, empty, and invalid values", async () => {
  const fetchStub: typeof fetch = async () => jsonResponse({ status: "1", pois: [
    { id: "both", name: "Both", location: "114.001,22", business: { opentime_today: "10:00-22:00", opentime_week: "周一至周日 10:00-22:00" } },
    { id: "today", name: "Today", location: "114.002,22", business: { opentime_today: "全天", opentime_week: "" } },
    { id: "week", name: "Week", location: "114.003,22", business: { opentime_today: " ", opentime_week: "周末 09:00-18:00" } },
    { id: "invalid", name: "Invalid", location: "114.004,22", business: { opentime_today: 24, opentime_week: [] } },
    { id: "missing", name: "Missing", location: "114.005,22" },
  ] });
  const places = (await createAmapClient("test-key", fetchStub).searchNearby({ longitude: 114, latitude: 22 }, hotel, { radiusMeters: 3000, pageNumber: 1, pageSize: 25 })).places;
  const byId = new Map(places.map((place) => [place.id, place]));
  assert.deepEqual([byId.get("both")?.openTimeToday, byId.get("both")?.openTimeWeek], ["10:00-22:00", "周一至周日 10:00-22:00"]);
  assert.deepEqual([byId.get("today")?.openTimeToday, byId.get("today")?.openTimeWeek], ["全天", null]);
  assert.deepEqual([byId.get("week")?.openTimeToday, byId.get("week")?.openTimeWeek], [null, "周末 09:00-18:00"]);
  assert.deepEqual([byId.get("invalid")?.openTimeToday, byId.get("invalid")?.openTimeWeek], [null, null]);
  assert.deepEqual([byId.get("missing")?.openTimeToday, byId.get("missing")?.openTimeWeek], [null, null]);
});

test("strategy parameters vary without duplicating typecodes", async () => {
  const urls: URL[] = [];
  const fetchStub: typeof fetch = async (input) => { urls.push(new URL(input instanceof Request ? input.url : input.toString())); return jsonResponse({ status: "1", pois: [] }); };
  const client = createAmapClient("test-key", fetchStub);
  const centre = { longitude: 114, latitude: 22 };
  await client.searchNearby(centre, hotel, { radiusMeters: 1000, pageNumber: 2, pageSize: 1, strategy: "keyword-only" });
  await client.searchNearby(centre, hotel, { radiusMeters: 1000, pageNumber: 2, pageSize: 1, strategy: "keyword-and-types" });
  assert.equal(urls[0]?.searchParams.get("keywords"), hotel.keyword);
  assert.equal(urls[0]?.searchParams.has("types"), false);
  assert.equal(urls[1]?.searchParams.get("keywords"), hotel.keyword);
  assert.equal(urls[1]?.searchParams.get("types"), hotel.types.join("|"));
  assert.equal(urls[1]?.searchParams.get("page_num"), "2");
});

test("missing or invalid native distance uses computed fallback", async () => {
  for (const distance of [undefined, "", [], "-1", "NaN"]) {
    const fetchStub: typeof fetch = async () => jsonResponse({ status: "1", pois: [{ id: "x", name: "X", location: "114.001,22", distance }] });
    const page = await createAmapClient("test-key", fetchStub).searchNearby({ longitude: 114, latitude: 22 }, hotel, { radiusMeters: 3000, pageNumber: 1, pageSize: 25 });
    assert.equal(page.places[0]?.distanceSource, "computed");
    assert.equal(page.places[0]?.amapDistanceMeters, null);
    assert.equal(page.places[0]?.distanceMeters, page.places[0]?.computedDistanceMeters);
  }
});

test("invalid page options are rejected before fetch", async () => {
  const client = createAmapClient("test-key", async () => { throw new Error("must not fetch"); });
  await assert.rejects(client.searchNearby({ longitude: 0, latitude: 0 }, hotel, { radiusMeters: 3000, pageNumber: 0, pageSize: 25 }), /pageNumber/);
  await assert.rejects(client.searchNearby({ longitude: 0, latitude: 0 }, hotel, { radiusMeters: 3000, pageNumber: 1, pageSize: 26 }), /pageSize/);
});

test("AMap-declared errors preserve info and infocode", async () => {
  const fetchStub: typeof fetch = async () => jsonResponse({ status: "0", info: "USERKEY_PLAT_NOMATCH", infocode: "10009" });
  await assert.rejects(createAmapClient("test-key", fetchStub).geocode("香港城市大学"), (error: unknown) => {
    assert.ok(error instanceof AmapApiError);
    assert.equal(error.info, "USERKEY_PLAT_NOMATCH");
    assert.equal(error.infocode, "10009");
    return true;
  });
});
