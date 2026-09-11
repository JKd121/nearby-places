import assert from "node:assert/strict";
import test from "node:test";
import { CATEGORIES } from "../src/amap/categories.js";
import { parseConfirmedSearchRequest, parseSearchRequest } from "../src/search/validation.js";

test("valid request is trimmed and preserves selected category order", () => {
  const ids = [CATEGORIES[2]!.key, CATEGORIES[0]!.key];
  assert.deepEqual(parseSearchRequest({ query: " 深圳北站 ", categoryIds: ids, radiusMeters: 3000 }), { query: "深圳北站", categoryIds: ids, radiusMeters: 3000 });
});

test("request rejects empty/unknown/duplicate categories, invalid radius and browser-controlled internals", () => {
  const id = CATEGORIES[0]!.key;
  assert.throws(() => parseSearchRequest({ query: " ", categoryIds: [id], radiusMeters: 3000 }), /query/);
  assert.throws(() => parseSearchRequest({ query: "x", categoryIds: [], radiusMeters: 3000 }), /non-empty/);
  assert.throws(() => parseSearchRequest({ query: "x", categoryIds: ["custom"], radiusMeters: 3000 }), /unknown/);
  assert.throws(() => parseSearchRequest({ query: "x", categoryIds: [id, id], radiusMeters: 3000 }), /duplicate/);
  assert.throws(() => parseSearchRequest({ query: "x", categoryIds: [id], radiusMeters: 2500 }), /radiusMeters/);
  for (const field of ["apiKey", "keyword", "types", "pageSize"]) {
    assert.throws(() => parseSearchRequest({ query: "x", categoryIds: [id], radiusMeters: 3000, [field]: "forbidden" }), /unsupported/);
  }
});

test("confirmed request validates the resolved centre and rejects mismatched coordinates", () => {
  const resolvedLocation = {
    query: "深圳北站",
    formattedAddress: "广东省深圳市龙华区深圳北站",
    province: "广东省",
    city: "深圳市",
    district: "龙华区",
    longitude: 114.029,
    latitude: 22.609,
    level: "兴趣点",
  };
  const parsed = parseConfirmedSearchRequest({
    center: { longitude: resolvedLocation.longitude, latitude: resolvedLocation.latitude },
    resolvedLocation,
    categoryIds: [CATEGORIES[0]!.key],
    radiusMeters: 3000,
  });
  assert.deepEqual(parsed.resolvedLocation, resolvedLocation);
  assert.throws(() => parseConfirmedSearchRequest({
    center: { longitude: 0, latitude: 0 },
    resolvedLocation,
    categoryIds: [CATEGORIES[0]!.key],
    radiusMeters: 3000,
  }), /match resolvedLocation/);
  assert.throws(() => parseConfirmedSearchRequest({
    center: { longitude: resolvedLocation.longitude, latitude: resolvedLocation.latitude },
    resolvedLocation,
    categoryIds: [CATEGORIES[0]!.key],
    radiusMeters: 3000,
    query: "深圳北站",
  }), /unsupported/);
});
