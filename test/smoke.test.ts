import assert from "node:assert/strict";
import test from "node:test";
import { CATEGORIES } from "../src/amap/categories.js";
import { searchCategoriesForSmoke } from "../src/amap/smoke.js";
import type { GeocodedPlace, PlacePage } from "../src/amap/types.js";

const categories = CATEGORIES.slice(0, 3);
const emptyPage: PlacePage = { places: [], pageNumber: 1, pageSize: 25, returnedCount: 0, mayHaveNextApiPage: false };
const shenzhen: GeocodedPlace = { query: "深圳北站", formattedAddress: "广东省深圳市龙华区深圳北站", province: "广东省", city: "深圳市", district: "龙华区", longitude: 114.029, latitude: 22.609, level: "兴趣点" };

test("category searches are sequential, delayed after success and failure, and continue", async () => {
  const events: string[] = [];
  let active = 0;
  let maximumActive = 0;
  const outcome = await searchCategoriesForSmoke(shenzhen, categories, async (_centre, category) => {
    events.push(`start:${category.key}`); active += 1; maximumActive = Math.max(maximumActive, active); await Promise.resolve(); active -= 1; events.push(`end:${category.key}`);
    if (category.key === "mall") throw new Error("QPS test error (10021)");
    return emptyPage;
  }, 3_000, async (milliseconds) => { assert.equal(active, 0); events.push(`delay:${milliseconds}`); });
  assert.equal(maximumActive, 1);
  assert.deepEqual(events, ["start:hotel", "end:hotel", "delay:500", "start:mall", "end:mall", "delay:500", "start:hotpot", "end:hotpot"]);
  assert.equal(outcome.results[1]?.error?.message, "QPS test error (10021)");
  assert.equal(outcome.results[2]?.category.key, "hotpot");
});

test("obvious non-Hong Kong match starts no nearby searches", async () => {
  let calls = 0;
  const falseMatch: GeocodedPlace = { query: "香港特别行政区九龙达之路香港城市大学", formattedAddress: "四川省成都市双流区香港城市大学", province: "四川省", city: "成都市", district: "双流区", longitude: 103.902082, latitude: 30.580993, level: "兴趣点" };
  const outcome = await searchCategoriesForSmoke(falseMatch, categories, async () => { calls += 1; return emptyPage; }, 3_000, async () => {});
  assert.equal(calls, 0);
  assert.match(outcome.validationError ?? "", /non-Hong Kong/);
  assert.match(outcome.validationError ?? "", /103[.]902082,30[.]580993/);
});

test("Hong Kong administrative match proceeds", async () => {
  let calls = 0;
  const hongKong: GeocodedPlace = { query: "香港特别行政区九龙达之路香港城市大学", formattedAddress: "香港特别行政区深水埗区达之路83号", province: "香港特别行政区", city: null, district: "深水埗区", longitude: 114.172, latitude: 22.337, level: "兴趣点" };
  const outcome = await searchCategoriesForSmoke(hongKong, categories, async () => { calls += 1; return emptyPage; }, 3_000, async () => {});
  assert.equal(outcome.validationError, null);
  assert.equal(calls, categories.length);
});
