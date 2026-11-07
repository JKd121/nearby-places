import assert from "node:assert/strict";
import test from "node:test";
import "./admission-fixture.js";
import { readSearchStream } from "../src/web/search-stream.js";
import type { SearchResponse, SearchStreamEvent } from "../src/search/contracts.js";
const { POST } = await import("../app/api/search/route.js");

const center = { query: "测试中心", formattedAddress: "测试地址", province: null, city: null, district: null, level: null, longitude: 114, latitude: 22 };
const body = { center, resolvedLocation: center, categoryIds: ["hotel", "mall", "hotpot"], radiusMeters: 3000 };
const makeRequest = (signal?: AbortSignal, value: unknown = body) => new Request("http://localhost/api/search", {
  method: "POST", headers: { accept: "application/x-ndjson" }, body: JSON.stringify(value), ...(signal ? { signal } : {}),
});
const ok = () => Response.json({ status: "1", pois: [] });
async function isolated(fetchMock: typeof fetch, run: () => Promise<void>, timeout = "2000") {
  const previousFetch = globalThis.fetch;
  const previousEnv = { ...process.env };
  const previousLog = console.error;
  const logs: unknown[][] = [];
  globalThis.fetch = fetchMock;
  Object.assign(process.env, { AMAP_WEB_SERVICE_KEY: "stream-SECRET", AMAP_UPSTREAM_TIMEOUT_MS: timeout, AMAP_REQUEST_TIMEOUT_MS: timeout, AMAP_MAX_RESPONSE_BYTES: "1048576", AMAP_HOST_MAX_DURATION_MS: "5000" });
  console.error = (...args: unknown[]) => { logs.push(args); };
  try { await run(); assert.equal(JSON.stringify(logs).includes("stream-SECRET"), false); }
  finally {
    globalThis.fetch = previousFetch; console.error = previousLog;
    for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
    Object.assign(process.env, previousEnv);
  }
}
async function events(response: Response): Promise<SearchStreamEvent[]> {
  assert.match(response.headers.get("content-type") ?? "", /application\/x-ndjson/);
  return (await response.text()).trim().split("\n").map(line => JSON.parse(line));
}

test("stream delivers one category while others hang; complete is unique and ordered", async () => {
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  await isolated(async () => { if (++calls > 1) await blocked; return ok(); }, async () => {
    const response = await POST(makeRequest());
    const received: SearchStreamEvent[] = [];
    const result = await readSearchStream(response, progress => {
      received.push({ type: "progress", progress });
      if (progress.results.length === 1) { assert.ok(progress.active.length > 0); release(); }
    }, new AbortController().signal);
    assert.ok(received.some(event => event.type === "progress" && event.progress.results.length === 1));
    assert.deepEqual(result.categories.map(item => item.category.key), body.categoryIds);
    assert.deepEqual(result.categories.map(item => item.status), ["empty", "empty", "empty"]);
  });
});

test("out-of-order category completion is visible immediately; final order stays stable", async () => {
  let release!: () => void;
  const first = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  await isolated(async () => { if (++calls === 1) await first; return ok(); }, async () => {
    const progressKeys: string[][] = [];
    const result = await readSearchStream(await POST(makeRequest()), progress => {
      progressKeys.push(progress.results.map(item => item.category.key));
      if (progress.results.some(item => item.category.key === "mall")) release();
    }, new AbortController().signal);
    assert.ok(progressKeys.some(keys => keys.includes("mall") && !keys.includes("hotel")));
    assert.deepEqual(result.categories.map(item => item.category.key), body.categoryIds);
  });
});

test("stream total deadline survives headers and retains completed categories", async () => {
  let calls = 0; const signals: AbortSignal[] = [];
  await isolated(async (_input, init) => {
    if (++calls === 1) return ok();
    signals.push(init!.signal!); return new Promise<Response>(() => {});
  }, async () => {
    const received = await events(await POST(makeRequest()));
    const terminal = received.filter(item => item.type !== "progress");
    assert.equal(terminal.length, 1);
    const last = terminal[0]; assert.equal(last?.type, "complete");
    if (last?.type !== "complete") return;
    assert.equal(last.response.categories[0]?.status, "empty");
    assert.equal(last.response.termination?.code, "REQUEST_DEADLINE_EXCEEDED");
    assert.equal(signals.every(signal => signal.aborted), true);
  }, "100");
});

test("deadline before any result sends one safe terminal error", async () => {
  await isolated(async () => new Promise<Response>(() => {}), async () => {
    const received = await events(await POST(makeRequest()));
    const terminal = received.filter(item => item.type !== "progress");
    assert.equal(terminal.length, 1);
    assert.equal(terminal[0]?.type, "error");
    if (terminal[0]?.type === "error") assert.equal(terminal[0].error.code, "REQUEST_DEADLINE_EXCEEDED");
  }, "60");
});

test("reader cancellation after headers aborts all active provider calls", async () => {
  const signals: AbortSignal[] = [];
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  await isolated(async (_input, init) => { signals.push(init!.signal!); started(); return new Promise<Response>(() => {}); }, async () => {
    const response = await POST(makeRequest());
    const reader = response.body!.getReader();
    await ready; await reader.cancel();
    assert.ok(signals.length > 0);
    assert.equal(signals.every(signal => signal.aborted), true);
    await new Promise(resolve => setImmediate(resolve));
  });
});

test("request cancellation after partial progress closes stream and aborts remaining work", async () => {
  const parent = new AbortController(); const signals: AbortSignal[] = [];
  let calls = 0;
  await isolated(async (_input, init) => {
    if (++calls === 1) return ok();
    signals.push(init!.signal!); return new Promise<Response>(() => {});
  }, async () => {
    await assert.rejects(readSearchStream(await POST(makeRequest(parent.signal)), progress => {
      if (progress.results.length > 0) parent.abort();
    }, parent.signal), /连接已中断/);
    assert.equal(signals.every(signal => signal.aborted), true);
  });
});

test("stream preserves safe category failures and shared-resource termination", async () => {
  for (const infocode of ["10021", "10003", "10001"]) {
    let calls = 0;
    await isolated(async () => ++calls === 1 ? ok() : Response.json({ status: "0", infocode, info: "stream-SECRET raw provider" }), async () => {
      const received = await events(await POST(makeRequest()));
      const terminal = received.filter(event => event.type !== "progress"); assert.equal(terminal.length, 1);
      const last = terminal[0]; assert.equal(last?.type, "complete");
      if (last?.type === "complete") {
        assert.equal(last.response.categories[0]?.status, "empty");
        assert.equal(last.response.categories[1]?.status, "error");
        if (infocode !== "10021") assert.ok(last.response.termination);
      }
      assert.equal(JSON.stringify(received).includes("stream-SECRET"), false);
      assert.equal(JSON.stringify(received).includes(infocode), false);
    });
  }
});

test("all recoverable category failures still complete with full list", async () => {
  await isolated(async () => Response.json({ status: "0", infocode: "10021" }), async () => {
    const received = await events(await POST(makeRequest()));
    const last = received.at(-1); assert.equal(last?.type, "complete");
    if (last?.type === "complete") assert.deepEqual(last.response.categories.map(item => item.status), ["error", "error", "error"]);
    assert.equal(received.filter(item => item.type !== "progress").length, 1);
  });
});

test("stream validation keeps JSON HTTP errors before headers and makes zero calls", async () => {
  let calls = 0;
  await isolated(async () => { calls++; return ok(); }, async () => {
    assert.equal((await POST(makeRequest(undefined, {}))).status, 400);
    assert.equal((await POST(new Request("http://localhost/", { method: "POST", headers: { accept: "application/x-ndjson" }, body: "{" }))).status, 400);
    assert.equal((await POST(makeRequest(undefined, { ...body, padding: "x".repeat(70_000) }))).status, 413);
    const parent = new AbortController(); parent.abort();
    assert.equal((await POST(makeRequest(parent.signal))).status, 499);
    assert.equal(calls, 0);
  });
});

test("stream body parsing stays inside the total deadline", async () => {
  await isolated(async () => { throw new Error("must not call provider"); }, async () => {
    const request = new Request("http://localhost/api/search", { method: "POST", headers: { accept: "application/x-ndjson" }, body: new ReadableStream(), duplex: "half" } as RequestInit);
    const response = await POST(request);
    assert.equal(response.status, 504);
    assert.equal((await response.json()).error.code, "REQUEST_DEADLINE_EXCEEDED");
  }, "60");
});

test("shared-resource error before success has one safe stream error terminal", async () => {
  for (const infocode of ["10003", "10001"]) await isolated(async () => Response.json({ status: "0", infocode, info: "stream-SECRET" }), async () => {
    const received = await events(await POST(makeRequest()));
    const terminal = received.filter(event => event.type !== "progress");
    assert.equal(terminal.length, 1); assert.equal(terminal[0]?.type, "error");
    assert.equal(JSON.stringify(received).includes("stream-SECRET"), false);
  });
});

const final: SearchResponse = { resolvedLocation: center, categories: [], status: "success" };
function chunked(parts: Uint8Array[]) { return new Response(new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close(); } })); }
test("browser parser handles UTF-8 split bytes, coalesced events and final unterminated line", async () => {
  const text = JSON.stringify({ type: "progress", progress: { results: [], active: ["hotel"], pending: [] } }) + "\n\n" + JSON.stringify({ type: "complete", response: final });
  const bytes = new TextEncoder().encode(text); let updates = 0;
  const response = await readSearchStream(chunked(Array.from(bytes, byte => new Uint8Array([byte]))), () => updates++, new AbortController().signal);
  assert.deepEqual(response, final); assert.equal(updates, 1);
});
test("browser parser retains observed progress and rejects EOF without terminal message", async () => {
  let updates = 0;
  const bytes = new TextEncoder().encode(JSON.stringify({ type: "progress", progress: { results: [], active: ["hotel"], pending: [] } }) + "\n");
  await assert.rejects(readSearchStream(chunked([bytes]), () => updates++, new AbortController().signal), /连接已中断/);
  assert.equal(updates, 1);
});
test("browser parser reports safe terminal error and malformed messages", async () => {
  const signal = new AbortController().signal;
  await assert.rejects(readSearchStream(chunked([new TextEncoder().encode('{"type":"error","error":{"message":"安全错误"}}\n')]), () => {}, signal), /安全错误/);
  for (const line of ["{bad json", '{"type":"other"}', '{"type":"progress"}']) {
    await assert.rejects(readSearchStream(chunked([new TextEncoder().encode(line)]), () => {}, signal), /连接已中断/);
  }
});
