import assert from "node:assert/strict";
import test from "node:test";
import { CATEGORIES } from "../src/amap/categories.js";
import "./admission-fixture.js";
const { POST } = await import("../app/api/search/page/route.js");

const routeUrl = "http://localhost/api/search/page";
const validBody = {
  center: { longitude: 114.029, latitude: 22.609 },
  categoryId: CATEGORIES[0]!.key,
  radiusMeters: 3000,
};

function request(body: string | object): Request {
  return new Request(routeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function withServerEnvironment(
  key: string | undefined,
  fetchImpl: typeof fetch,
  run: () => Promise<void>,
): Promise<void> {
  const previousKey = process.env.AMAP_WEB_SERVICE_KEY;
  const previousFetch = globalThis.fetch;
  try {
    if (key === undefined) delete process.env.AMAP_WEB_SERVICE_KEY;
    else process.env.AMAP_WEB_SERVICE_KEY = key;
    globalThis.fetch = fetchImpl;
    await run();
  } finally {
    if (previousKey === undefined) delete process.env.AMAP_WEB_SERVICE_KEY;
    else process.env.AMAP_WEB_SERVICE_KEY = previousKey;
    globalThis.fetch = previousFetch;
  }
}

test("second-page route rejects malformed JSON without a provider request", async () => {
  let fetchCount = 0;
  await withServerEnvironment("test-only-dummy-key", async () => {
    fetchCount += 1;
    throw new Error("provider fetch must not run");
  }, async () => {
    const response = await POST(request("{"));
    assert.equal(response.status, 400);
    assert.equal(fetchCount, 0);
  });
});

test("second-page route rejects page controls and provider fields", async () => {
  let fetchCount = 0;
  await withServerEnvironment("test-only-dummy-key", async () => {
    fetchCount += 1;
    throw new Error("provider fetch must not run");
  }, async () => {
    for (const field of ["pageNumber", "pageSize", "provider"]) {
      const response = await POST(request({ ...validBody, [field]: "forbidden" }));
      assert.equal(response.status, 400);
    }
    assert.equal(fetchCount, 0);
  });
});

test("second-page route uses server-owned page 2/25 and returns the page contract", async () => {
  const dummyKey = "test-only-dummy-key";
  let fetchCount = 0;
  let requestedUrl: URL | null = null;
  await withServerEnvironment(dummyKey, async (input) => {
    fetchCount += 1;
    requestedUrl = new URL(input instanceof Request ? input.url : input.toString());
    return new Response(JSON.stringify({ status: "1", count: "0", pois: [] }), { status: 200 });
  }, async () => {
    const response = await POST(request(validBody));
    assert.equal(response.status, 200);
    assert.equal(fetchCount, 1);
    assert.equal(requestedUrl?.pathname, "/v5/place/around");
    assert.equal(requestedUrl?.searchParams.get("page_num"), "2");
    assert.equal(requestedUrl?.searchParams.get("page_size"), "25");
    assert.equal(requestedUrl?.searchParams.get("key"), dummyKey);
    assert.deepEqual(await response.json(), {
      categoryId: validBody.categoryId,
      page: { places: [], pageNumber: 2, pageSize: 25, returnedCount: 0, mayHaveNextApiPage: false },
    });
  });
});

test("second-page route hides provider diagnostics and does not retry", async () => {
  const dummyKey = "test-only-dummy-key";
  let fetchCount = 0;
  await withServerEnvironment(dummyKey, async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({ status: "0", info: "SENSITIVE_PROVIDER_INFO", infocode: "10021" }), { status: 200 });
  }, async () => {
    const response = await POST(request(validBody));
    assert.equal(response.status, 502);
    assert.equal(fetchCount, 1);
    const body = await response.json();
    assert.deepEqual(body, { error: { message: "服务暂不可用，请稍后再试" } });
    const serialized = JSON.stringify(body);
    for (const forbidden of [dummyKey, "SENSITIVE_PROVIDER_INFO", "10021", "restapi.amap.com", "info", "infocode", "stack"]) {
      assert.equal(serialized.includes(forbidden), false);
    }
  });
});

test("second-page route handles a missing server key without network or internal leakage", async () => {
  let fetchCount = 0;
  await withServerEnvironment(undefined, async () => {
    fetchCount += 1;
    throw new Error("provider fetch must not run");
  }, async () => {
    const response = await POST(request(validBody));
    assert.equal(response.status, 500);
    assert.equal(fetchCount, 0);
    const body = await response.json();
    assert.deepEqual(body, { error: { message: "服务暂不可用，请稍后再试" } });
    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes("AMAP_WEB_SERVICE_KEY"), false);
    assert.equal(serialized.includes("not configured"), false);
    assert.equal(serialized.includes("stack"), false);
  });
});
