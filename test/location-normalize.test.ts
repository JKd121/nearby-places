import assert from "node:assert/strict";
import test from "node:test";
import { normalizePlaceType } from "../src/location/normalize.js";

test("normalizes common AMap type paths to short labels", () => {
  assert.equal(normalizePlaceType("交通设施服务;火车站;火车站"), "火车站");
  assert.equal(normalizePlaceType("交通设施服务;地铁站;地铁站"), "地铁站");
  assert.equal(normalizePlaceType("住宿服务;宾馆酒店;经济型连锁酒店"), "酒店");
  assert.equal(normalizePlaceType("科教文化服务;学校;高等院校"), "学校");
  assert.equal(normalizePlaceType("娱乐服务;KTV"), "KTV");
});

test("missing or technical-only provider type is nullable", () => {
  assert.equal(normalizePlaceType(null), null);
  assert.equal(normalizePlaceType(""), null);
  assert.equal(normalizePlaceType("交通设施服务;其他"), null);
});
