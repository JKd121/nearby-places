import assert from "node:assert/strict";
import test from "node:test";
import { AmapApiError } from "../src/amap/client.js";
import { mapLocationResolverError } from "../src/location/http.js";

test("resolver route error boundary strips provider-specific details", async () => {
  const response = mapLocationResolverError(new AmapApiError("raw provider message with secret-bearing URL", "CUQPS_HAS_EXCEEDED_THE_LIMIT", "10021"));
  assert.equal(response.status, 502);
  const body = await response.json() as Record<string, unknown>;
  assert.deepEqual(Object.keys(body), ["error"]);
  assert.deepEqual(Object.keys(body.error as Record<string, unknown>), ["message"]);
  assert.deepEqual(body, { error: { message: "服务暂不可用，请稍后再试" } });
  assert.equal(JSON.stringify(body).includes("CUQPS"), false);
  assert.equal(JSON.stringify(body).includes("10021"), false);
  assert.equal(JSON.stringify(body).includes("raw provider"), false);
});
