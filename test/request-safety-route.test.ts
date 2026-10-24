import assert from "node:assert/strict";
import test from "node:test";
import { POST as search } from "../app/api/search/route.js";
import { POST as resolve } from "../app/api/resolve-location/route.js";
import { POST as page } from "../app/api/search/page/route.js";
import { withRequestLifecycle } from "../src/server/request-lifecycle.js";
import { createServerLocationResolverProvider, createServerAmapClient } from "../src/server/amap.js";
import { STAGE_A_POLICY } from "../src/amap/policy.js";

const centre = { query: "fixture", formattedAddress: "fixture", province: null, city: null, district: null, level: null, longitude: 114, latitude: 22 };
const searchBody = { center: centre, resolvedLocation: centre, categoryIds: ["hotel", "mall"], radiusMeters: 3000 };
const pageBody = { center: centre, categoryId: "hotel", radiusMeters: 3000 };
const makeRequest = (body: unknown, signal?: AbortSignal) => new Request("http://localhost/api/fixture", { method: "POST", body: JSON.stringify(body), ...(signal ? { signal } : {}) });
const config = { AMAP_UPSTREAM_TIMEOUT_MS: "500", AMAP_REQUEST_TIMEOUT_MS: "2000", AMAP_MAX_RESPONSE_BYTES: "1048576", AMAP_HOST_MAX_DURATION_MS: "5000" };
async function isolated(fetchImpl: typeof fetch, run: (logs: unknown[][]) => Promise<void>, overrides: Record<string, string> = {}) {
  const previousFetch = globalThis.fetch; const previousEnv = { ...process.env }; const previousLog = console.error;
  const logs: unknown[][] = [];
  try {
    globalThis.fetch = fetchImpl; process.env.AMAP_WEB_SERVICE_KEY = "test-only-SECRET"; Object.assign(process.env, config, overrides);
    console.error = (...args: unknown[]) => { logs.push(args); };
    await run(logs); assert.equal(JSON.stringify(logs).includes("SECRET"), false);
  } finally {
    globalThis.fetch = previousFetch; console.error = previousLog;
    for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
    Object.assign(process.env, previousEnv);
  }
}

test("both factories cover geocode/text/nearby/page 2 through the same guarded transport", async () => {
  const paths: string[] = []; const pages: string[] = [];
  await isolated(async (input, init) => {
    assert.ok(init?.signal); assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store");
    const url = new URL(String(input)); paths.push(url.pathname); pages.push(url.searchParams.get("page_num") ?? "");
    return Response.json({ status: "1", geocodes: [ { location: "114,22", formatted_address: "fixture" } ], pois: [] });
  }, async () => {
    const resolver = createServerLocationResolverProvider(); await resolver.geocode("fixture"); await resolver.searchPlaceCandidates("fixture");
    const client = createServerAmapClient(); await client.searchNearby(centre, (await import("../src/amap/categories.js")).CATEGORIES[0]!, { pageNumber: 1, pageSize: 25, radiusMeters: 3000 });
    assert.equal((await page(makeRequest(pageBody))).status, 200);
  });
  assert.deepEqual(paths, ["/v3/geocode/geo", "/v5/place/text", "/v5/place/around", "/v5/place/around"]); assert.equal(pages[3], "2");
});

for (const [name, post, body] of [
  ["resolve", resolve, { query: "深圳北站" }],
  ["search", search, { ...searchBody, categoryIds: ["hotel"] }],
  ["page", page, pageBody],
] as const) {
  test(`${name} route accepts exactly 64 KiB of valid JSON with whitespace padding`, async () => {
    let calls = 0;
    await isolated(async () => { calls++; return Response.json({ status: "1", pois: [] }); }, async () => {
      const json = JSON.stringify(body);
      const padding = STAGE_A_POLICY.maxRequestBytes - new TextEncoder().encode(json).byteLength;
      const request = new Request("http://localhost/api/fixture", { method: "POST", body: json + " ".repeat(padding), headers: { "content-length": "1" } });
      assert.equal((await post(request)).status, 200);
    });
    assert.equal(calls, 1);
  });

  test(`${name} route rejects 64 KiB + 1 as terminal safe 413, not 400, with zero provider calls`, async () => {
    let calls = 0; let cancelled = 0; let pulls = 0;
    await isolated(async () => { calls++; throw Error("must not reach provider"); }, async logs => {
      const bytes = new TextEncoder().encode(JSON.stringify(body));
      const padding = new TextEncoder().encode(" ".repeat(STAGE_A_POLICY.maxRequestBytes - bytes.length + 1));
      const controller = new AbortController();
      const request = new Request("http://localhost/api/fixture", { method: "POST", signal: controller.signal, headers: { "content-length": "1" }, duplex: "half", body: new ReadableStream({
        pull(stream) { pulls++; stream.enqueue(pulls === 1 ? bytes : padding); }, cancel() { cancelled++; },
      }, { highWaterMark: 0 }) } as RequestInit);
      const response = await post(request);
      assert.equal(response.status, 413);
      assert.deepEqual(await response.json(), { error: { message: "请求内容过大，请缩短后重试", code: "REQUEST_BODY_TOO_LARGE" } });
      assert.equal(pulls, 2); assert.equal(cancelled, 1); assert.equal(request.body?.locked, false);
      assert.equal(logs.length, 1); assert.deepEqual(logs[0], ["request.failed", { code: "REQUEST_BODY_TOO_LARGE", upstreamStatus: null, infocode: null }]);
      controller.abort(); // Late cancellation must not change the already selected 413.
      assert.equal(response.status, 413);
    });
    assert.equal(calls, 0);
  });

  test(`${name} route retains malformed JSON 400, cancellation 499 and total deadline 504`, async () => {
    let calls = 0;
    await isolated(async () => { calls++; throw Error("must not fetch"); }, async () => {
      const malformed = new Request("http://localhost/", { method: "POST", body: "{" });
      assert.equal((await post(malformed)).status, 400);
      const parent = new AbortController(); parent.abort();
      assert.equal((await post(makeRequest(body, parent.signal))).status, 499);
      const stuck = new Request("http://localhost/", { method: "POST", body: new ReadableStream(), duplex: "half" } as RequestInit);
      const response = await post(stuck);
      assert.equal(response.status, 504);
      assert.equal((await response.json() as { error: { code: string } }).error.code, "REQUEST_DEADLINE_EXCEEDED");
    }, { AMAP_UPSTREAM_TIMEOUT_MS: "5", AMAP_REQUEST_TIMEOUT_MS: "5" });
    assert.equal(calls, 0);
  });
}

test("real resolver/search/page Route entry points all use guarded transport", async () => {
  let calls = 0;
  await isolated(async (_input, init) => { calls++; assert.ok(init?.signal); assert.equal(init.redirect, "error"); return Response.json({ status: "1", pois: [] }); }, async () => {
    assert.equal((await resolve(makeRequest({ query: "深圳北站" }))).status, 200);
    assert.equal((await search(makeRequest({ ...searchBody, categoryIds: ["hotel"] }))).status, 200);
    assert.equal((await page(makeRequest(pageBody))).status, 200);
  }); assert.equal(calls, 3);
});

test("all failures are 502; authentication is 503 and stops before category 2", async () => {
  for (const [infocode, status, count] of [["10021", 502, 2], ["10001", 503, 1]] as const) {
    let calls = 0;
    await isolated(async () => { calls++; return Response.json({ status: "0", info: "SECRET raw upstream", infocode }); }, async () => {
      const response = await search(makeRequest(searchBody)); assert.equal(response.status, status);
      const serialized = await response.text(); for (const forbidden of ["SECRET", "10021", "10001", "infocode", "restapi"]) assert.equal(serialized.includes(forbidden), false);
    }); assert.equal(calls, count);
  }
});

test("pre-cancelled routes never fetch; cancellation while parsing is not a 400", async () => {
  let calls = 0;
  await isolated(async () => { calls++; throw Error(); }, async () => {
    const controller = new AbortController(); controller.abort(new Error("SECRET"));
    for (const [post, body] of [[resolve, { query: "fixture" }], [search, searchBody], [page, pageBody]] as const) assert.equal((await post(makeRequest(body, controller.signal))).status, 499);
    const active = new AbortController();
    let bodyCancelled = false;
    const request = new Request("http://localhost/", { method: "POST", body: new ReadableStream({ cancel() { bodyCancelled = true; } }), duplex: "half", signal: active.signal } as RequestInit);
    const pending = search(request); active.abort(); assert.equal((await pending).status, 499);
    assert.equal(bodyCancelled, true);
  }); assert.equal(calls, 0);
});

test("each route propagates cancellation to actual fetch signal", async () => {
  for (const [post, body] of [[resolve, { query: "深圳北站" }], [search, searchBody], [page, pageBody]] as const) {
    const controller = new AbortController(); let signal: AbortSignal | null | undefined; let calls = 0;
    await isolated(async (_url, init) => { calls++; signal = init?.signal; controller.abort(); return new Promise<Response>(() => {}); }, async () => {
      const response = await post(makeRequest(body, controller.signal)); assert.equal(response.status, 499); assert.ok(signal?.aborted);
    }); assert.equal(calls, 1);
  }
});

test("upstream timeout and whole-request timeout return 504 with distinct safe codes", async () => {
  for (const [upstream, total, expected] of [["5", "100", "UPSTREAM_TIMEOUT"], ["100", "5", "REQUEST_DEADLINE_EXCEEDED"]] as const) {
    let calls = 0;
    // Direct lifecycle policy still validates upstream <= total, so total deadline is exercised with stalled body parsing.
    await isolated(async () => { calls++; return new Promise<Response>(() => {}); }, async () => {
      const response = expected === "UPSTREAM_TIMEOUT" ? await search(makeRequest(searchBody)) : await search(new Request("http://localhost/", { method: "POST", body: new ReadableStream(), duplex: "half" } as RequestInit));
      assert.equal(response.status, 504); assert.equal((await response.json() as { error: { code: string } }).error.code, expected);
    }, { AMAP_UPSTREAM_TIMEOUT_MS: expected === "UPSTREAM_TIMEOUT" ? upstream : "5", AMAP_REQUEST_TIMEOUT_MS: total });
    assert.equal(calls, expected === "UPSTREAM_TIMEOUT" ? 1 : 0);
  }
});

test("lifecycle clears deadline after success and invalid explicit policy refuses safely", async () => {
  await isolated(async () => { throw Error("must not call"); }, async () => {
    let signal: AbortSignal | undefined;
    const response = await withRequestLifecycle(makeRequest({}), async context => { signal = context.signal; return Response.json({}); });
    assert.equal(response.status, 200); assert.equal(signal?.aborted, false);
    for (const key of Object.keys(config)) delete process.env[key];
    process.env.AMAP_REQUEST_TIMEOUT_MS = "0";
    assert.equal((await search(makeRequest(searchBody))).status, 503);
  });
});
