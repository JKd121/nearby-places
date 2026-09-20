import assert from "node:assert/strict";
import test from "node:test";
import { CATEGORIES } from "../src/amap/categories.js";

test("category configurations are complete and typecodes are centralized", () => {
  assert.equal(CATEGORIES.length, 10);
  assert.equal(new Set(CATEGORIES.map((category) => category.key)).size, CATEGORIES.length);
  for (const category of CATEGORIES) {
    assert.ok(category.types.length > 0);
    assert.ok(category.types.every((type) => /^\d{6}$/.test(type)));
    assert.ok(category.keyword.length > 0);
    assert.ok(["types-only", "keyword-only", "keyword-and-types"].includes(category.strategy));
  }
});

test("transit categories keep provider code provenance and independent empty states", () => {
  const bus = CATEGORIES.find((category) => category.key === "bus");
  const subway = CATEGORIES.find((category) => category.key === "subway");
  assert.deepEqual(bus?.types, ["150700"]);
  assert.deepEqual(subway?.types, ["150500"]);
  assert.deepEqual(subway?.acceptedTypecodes, ["150500"]);
  assert.equal(bus?.group, "transit");
  assert.equal(subway?.group, "transit");
  assert.equal(bus?.emptyState, "当前范围内暂无公交站");
  assert.equal(subway?.emptyState, "当前范围内暂无地铁站");
  assert.match(bus?.typecodeSource ?? "", /高德 POI 分类编码表/);
  assert.equal(bus?.typecodeSource, subway?.typecodeSource);
});
