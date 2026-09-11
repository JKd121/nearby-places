import assert from "node:assert/strict";
import test from "node:test";
import { CATEGORIES } from "../src/amap/categories.js";
import { isSortModeAllowed, sortPlaces } from "../src/search/sort.js";
import type { Place } from "../src/amap/types.js";

function place(id: string, distanceMeters: number, rating: number | null, cost: number | null): Place {
  return { id, name: id, category: "hotpot", distanceMeters, distanceSource: "amap", amapDistanceMeters: distanceMeters, computedDistanceMeters: distanceMeters, type: null, typecode: null, cost, rating, tag: null, address: "", longitude: 0, latitude: 0 };
}

test("sortPlaces is non-mutating, null-last in both directions, and uses distance tie-break", () => {
  const input = [place("null", 1, null, null), place("far", 4, 4.8, 20), place("near", 2, 4.8, 20), place("low", 3, 4.0, 10)];
  assert.deepEqual(sortPlaces(input, "rating-desc").map((item) => item.id), ["near", "far", "low", "null"]);
  assert.deepEqual(sortPlaces(input, "cost-asc").map((item) => item.id), ["low", "near", "far", "null"]);
  assert.deepEqual(sortPlaces(input, "cost-desc").map((item) => item.id), ["near", "far", "low", "null"]);
  assert.deepEqual(input.map((item) => item.id), ["null", "far", "near", "low"]);
});

test("cost sorting is limited to approved single categories", () => {
  const sortable = CATEGORIES.filter((category) => category.priceMode === "per-person-sortable" || category.priceMode === "reference-sortable");
  const forbidden = CATEGORIES.filter((category) => !sortable.includes(category));
  assert.ok(sortable.every((category) => isSortModeAllowed([category.key], "cost-asc")));
  assert.ok(forbidden.every((category) => !isSortModeAllowed([category.key], "cost-desc")));
  assert.equal(isSortModeAllowed(sortable.slice(0, 2).map((category) => category.key), "cost-asc"), false);
  assert.equal(isSortModeAllowed([], "rating-desc"), true);
});
