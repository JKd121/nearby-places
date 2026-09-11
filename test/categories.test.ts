import assert from "node:assert/strict";
import test from "node:test";
import { CATEGORIES } from "../src/amap/categories.js";

test("eight category configurations are complete and typecodes are centralized", () => {
  assert.equal(CATEGORIES.length, 8);
  assert.equal(new Set(CATEGORIES.map((category) => category.key)).size, CATEGORIES.length);
  for (const category of CATEGORIES) {
    assert.ok(category.types.length > 0);
    assert.ok(category.types.every((type) => /^\d{6}$/.test(type)));
    assert.ok(category.keyword.length > 0);
    assert.ok(["types-only", "keyword-only", "keyword-and-types"].includes(category.strategy));
  }
});
