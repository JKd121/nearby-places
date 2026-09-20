import assert from "node:assert/strict";
import test from "node:test";
import { CATEGORIES } from "../src/amap/categories.js";
import { parseConfirmedSearchRequest, parseSearchRequest, parseSearchSecondPageRequest } from "../src/search/validation.js";

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

test("second-page request accepts only a centre, one category and an allowed radius", () => {
  const center = { longitude: 114.029, latitude: 22.609 };
  for (const radiusMeters of [1000, 2000, 3000, 5000] as const) {
    assert.deepEqual(parseSearchSecondPageRequest({ center, categoryId: CATEGORIES[0]!.key, radiusMeters }), {
      center,
      categoryId: CATEGORIES[0]!.key,
      radiusMeters,
    });
  }
});

test("second-page request rejects invalid category, radius and coordinates", () => {
  const valid = { center: { longitude: 114, latitude: 22 }, categoryId: CATEGORIES[0]!.key, radiusMeters: 3000 };
  for (const categoryId of ["custom", [CATEGORIES[0]!.key]]) {
    assert.throws(() => parseSearchSecondPageRequest({ ...valid, categoryId }), /categoryId/);
  }
  assert.throws(() => parseSearchSecondPageRequest({ center: valid.center, categoryIds: [valid.categoryId], radiusMeters: valid.radiusMeters }), /unsupported/);
  assert.throws(() => parseSearchSecondPageRequest({ ...valid, radiusMeters: 2500 }), /radiusMeters/);

  for (const center of [
    { longitude: Number.NaN, latitude: 22 },
    { longitude: 114, latitude: Number.POSITIVE_INFINITY },
    { longitude: 180.001, latitude: 22 },
    { longitude: 114, latitude: 90.001 },
  ]) assert.throws(() => parseSearchSecondPageRequest({ ...valid, center }), /center/);
});

test("second-page request rejects every browser-controlled provider or extra field", () => {
  const valid = { center: { longitude: 114, latitude: 22 }, categoryId: CATEGORIES[0]!.key, radiusMeters: 3000 };
  for (const field of ["resolvedLocation", "pageNumber", "pageSize", "query", "categoryIds", "key", "apiKey", "keyword", "keywords", "types", "strategy", "provider", "unexpected"]) {
    assert.throws(() => parseSearchSecondPageRequest({ ...valid, [field]: "forbidden" }), /unsupported/);
  }
});
