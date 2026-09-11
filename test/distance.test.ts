import assert from "node:assert/strict";
import test from "node:test";
import { computeDistanceMeters } from "../src/amap/distance.js";

test("returns zero for identical coordinates", () => {
  assert.equal(
    computeDistanceMeters({ longitude: 114.029, latitude: 22.609 }, { longitude: 114.029, latitude: 22.609 }),
    0
  );
});

test("computes a known one-degree equatorial distance", () => {
  assert.ok(
    Math.abs(
      computeDistanceMeters({ longitude: 0, latitude: 0 }, { longitude: 1, latitude: 0 }) - 111_195
    ) <= 1
  );
});

test("is symmetric", () => {
  const shenzhenNorth = { longitude: 114.029, latitude: 22.609 };
  const cityUniversityHongKong = { longitude: 114.172, latitude: 22.337 };
  assert.equal(
    computeDistanceMeters(shenzhenNorth, cityUniversityHongKong),
    computeDistanceMeters(cityUniversityHongKong, shenzhenNorth)
  );
});
