import assert from "node:assert/strict";
import test from "node:test";
import { AmapApiError, createAmapClient } from "../src/amap/client.js";
import { CATEGORIES } from "../src/amap/categories.js";

const hotel = CATEGORIES[0]!;
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
  assert.equal(page.places[1]?.rating, 4.1);
  assert.equal(page.places[1]?.typecode, hotel.types[0]);
  assert.equal(page.returnedCount, 2);
  assert.equal(page.mayHaveNextApiPage, false);
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
