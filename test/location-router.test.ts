import assert from "node:assert/strict";
import test from "node:test";
import { routeLocationQuery } from "../src/location/router.js";

test("location router keeps named places and mixed clues as PLACE_QUERY", () => {
  for (const query of ["深圳北站", "香港城市大学", "澜庭酒店 深圳罗湖", "维也纳酒店", "广东省深圳市龙华区深圳北站", "深圳北站 火车站", "香港城市大学 九龙"]) {
    assert.equal(routeLocationQuery(query).kind, "PLACE_QUERY", query);
  }
});

test("location router recognizes strong street and doorplate evidence", () => {
  assert.deepEqual(routeLocationQuery("深圳市龙华区民治街道北站社区致远中路28号"), { rawQuery: "深圳市龙华区民治街道北站社区致远中路28号", kind: "ADDRESS_QUERY" });
  assert.deepEqual(routeLocationQuery("香港特别行政区九龙塘达之路83号"), { rawQuery: "香港特别行政区九龙塘达之路83号", kind: "ADDRESS_QUERY" });
});

test("ambiguous or region-only text conservatively remains a place query", () => {
  assert.equal(routeLocationQuery("深圳市龙华区").kind, "PLACE_QUERY");
  assert.equal(routeLocationQuery("大学路").kind, "PLACE_QUERY");
  assert.equal(routeLocationQuery("  深圳北站   ").rawQuery, "深圳北站");
});
