import assert from "node:assert/strict";
import test from "node:test";
import { createAmapTransport } from "../src/amap/transport.js";
import { AmapApiError, RequestTerminatedError, safeErrorDiagnostic } from "../src/amap/errors.js";
import { createRequestContext } from "../src/amap/request-context.js";
import { STAGE_A_POLICY } from "../src/amap/policy.js";
import { createServer } from "node:http";
import type { Diagnostics } from "../src/diagnostics.js";

const url = new URL("https://restapi.amap.com/v3/geocode/geo?key=test-only");
const policy = { upstreamTimeoutMs: 50, maxResponseBytes: 100 };
const hasCode = (code: string) => (error: unknown) => error instanceof AmapApiError && error.code === code;
function streamResponse(chunks: Uint8Array[], cancel: () => void = () => {}, close = true, headers: Record<string, string> = {}) {
  return new Response(new ReadableStream<Uint8Array>({ start(controller) { for (const chunk of chunks) controller.enqueue(chunk); if (close) controller.close(); }, cancel }), { headers });
}

test("one call, no redirects/cache; hook precedes fetch and sees service identity", async () => {
  const events: string[] = [];
  const client = createAmapTransport(async (_url, init) => {
    events.push("fetch"); assert.ok(init?.signal); assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store");
    return Response.json({ status: "1" });
  }, { policy, beforeAttempt: async operation => { events.push(operation); } });
  assert.deepEqual(await client.requestJson(url, "geocode"), { status: "1" });
  assert.deepEqual(events, ["geocode", "fetch"]);
});

test("hook rejection or cancellation never starts HTTP (minimal future budget contract)", async () => {
  let calls = 0;
  const context = createRequestContext();
  const client = createAmapTransport(async () => { calls++; return Response.json({ status: "1" }); }, {
    context, beforeAttempt: async () => { context.abort(new RequestTerminatedError("REQUEST_CANCELLED")); },
  });
  await assert.rejects(client.requestJson(url, "geocode"), hasCode("REQUEST_CANCELLED"));
  assert.equal(calls, 0); context.dispose();
  const failure = new Error("test-only hook rejection");
  await assert.rejects(createAmapTransport(async () => { calls++; throw failure; }, { beforeAttempt: async () => { throw failure; } }).requestJson(url, "geocode"), error => error === failure);
  assert.equal(calls, 0);
});

test("already cancelled calls do not invoke hook/fetch", async () => {
  const context = createRequestContext(); context.abort(new RequestTerminatedError("REQUEST_CANCELLED"));
  let calls = 0;
  await assert.rejects(createAmapTransport(async () => { calls++; throw Error(); }, { context, beforeAttempt: async () => { calls++; } }).requestJson(url, "geocode"), hasCode("REQUEST_CANCELLED"));
  assert.equal(calls, 0); context.dispose();
});

test("unexpected permit defects remain internal rather than becoming recoverable network errors", async () => {
  const defect = new Error("internal defect");
  const transport = createAmapTransport(async () => Response.json({ status: "1" }), { beforeAttempt: async () => ({ assertValid() { throw defect; } }) });
  await assert.rejects(transport.requestJson(url, "geocode"), error => error === defect);
});

test("header timeout bounds non-cooperative fetch, records no raw cause and never retries", async () => {
  let calls = 0;
  const client = createAmapTransport(async () => { calls++; return new Promise<Response>(() => {}); }, { policy: { ...policy, upstreamTimeoutMs: 5 } });
  await assert.rejects(client.requestJson(url, "geocode"), hasCode("UPSTREAM_TIMEOUT"));
  assert.equal(calls, 1);
});

test("body timeout remains active after headers and cancels the reader", async () => {
  let cancelled = 0;
  const client = createAmapTransport(async () => streamResponse([new TextEncoder().encode('{"status":')], () => { cancelled++; }, false), { policy: { ...policy, upstreamTimeoutMs: 5 } });
  await assert.rejects(client.requestJson(url, "geocode"), hasCode("UPSTREAM_TIMEOUT"));
  assert.equal(cancelled, 1);
});

test("actual bytes, not Content-Length or string length, enforce exact/inclusive boundary", async () => {
  const bytes = new TextEncoder().encode('{"status":"1","text":"中"}');
  const headerCases: Record<string, string>[] = [{}, { "content-length": "1" }, { "content-length": "99999999" }];
  for (const headers of headerCases) {
    const make = (limit: number) => createAmapTransport(async () => streamResponse([bytes.slice(0, 22), bytes.slice(22)], () => {}, true, headers), { policy: { upstreamTimeoutMs: 100, maxResponseBytes: limit } });
    assert.equal((await make(bytes.length).requestJson(url, "geocode")).text, "中");
    await assert.rejects(make(bytes.length - 1).requestJson(url, "geocode"), hasCode("UPSTREAM_BODY_TOO_LARGE"));
  }
});

test("overlarge endless stream cancels immediately without draining", async () => {
  let cancelled = 0;
  const client = createAmapTransport(async () => streamResponse([new Uint8Array(101)], () => { cancelled++; }, false), { policy });
  await assert.rejects(client.requestJson(url, "geocode"), hasCode("UPSTREAM_BODY_TOO_LARGE")); assert.equal(cancelled, 1);
});

test("cancel in fetch/body and request deadline preserve distinct first reasons", async () => {
  for (const phase of ["fetch", "body"]) {
    const context = createRequestContext(undefined, 5);
    const client = createAmapTransport(async () => phase === "fetch" ? new Promise<Response>(() => {}) : streamResponse([], () => {}, false), { context, policy: { ...policy, upstreamTimeoutMs: 500 } });
    await assert.rejects(client.requestJson(url, "geocode"), hasCode("REQUEST_DEADLINE_EXCEEDED")); context.dispose();
  }
  const parent = new AbortController(); const context = createRequestContext(parent.signal);
  const pending = createAmapTransport(async () => new Promise<Response>(() => {}), { context }).requestJson(url, "geocode");
  parent.abort(new Error("SECRET raw abort reason"));
  await assert.rejects(pending, hasCode("REQUEST_CANCELLED"));
  assert.equal(JSON.stringify(safeErrorDiagnostic(context.signal.reason)).includes("SECRET"), false); context.dispose();
});

test("safe classification for HTTP/JSON/business/network/redirect/read errors", async () => {
  const secret = "SECRET https://restapi.amap.com/?key=SECRET";
  const cases: [typeof fetch, string][] = [
    [async () => new Response(secret, { status: 502, statusText: "SECRET" }), "UPSTREAM_HTTP"],
    [async () => new Response(secret), "UPSTREAM_INVALID_JSON"],
    [async () => Response.json([]), "UPSTREAM_INVALID_PAYLOAD"],
    [async () => Response.json({ status: "0", info: secret, infocode: "10021" }), "UPSTREAM_BUSINESS"],
    [async () => Response.json({ status: "0", info: secret, infocode: "10001" }), "UPSTREAM_AUTH_FAILED"],
    [async () => { throw new Error(secret); }, "UPSTREAM_NETWORK"],
    [async () => new Response(null, { status: 302 }), "UPSTREAM_HTTP"],
    [async () => new Response(new ReadableStream({ start(c) { c.error(new Error(secret)); } })), "UPSTREAM_NETWORK"],
  ];
  for (const [fetchImpl, code] of cases) await assert.rejects(createAmapTransport(fetchImpl, { policy }).requestJson(url, "geocode"), error => {
    assert.ok(hasCode(code)(error)); assert.equal(String(error).includes("SECRET"), false); assert.equal(JSON.stringify(error).includes("SECRET"), false); return true;
  });
});

test("only expected HTTPS host and operation path allowed", async () => {
  let calls = 0;
  const transport = createAmapTransport(async () => { calls++; throw Error(); });
  for (const invalid of ["http://restapi.amap.com/v3/geocode/geo", "https://example.com/v3/geocode/geo", "https://restapi.amap.com/v5/place/around"]) await assert.rejects(transport.requestJson(new URL(invalid), "geocode"));
  assert.equal(calls, 0);
});

test("8-second candidate timeout is exact under a mocked clock", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let monotonic = 0;
  t.mock.method(performance, "now", () => monotonic);
  let signal: AbortSignal | null | undefined;
  const pending = createAmapTransport(async (_url, init) => { signal = init?.signal; return new Promise<Response>(() => {}); }).requestJson(url, "geocode");
  const rejected = assert.rejects(pending, hasCode("UPSTREAM_TIMEOUT"));
  monotonic += STAGE_A_POLICY.upstreamTimeoutMs - 1;
  t.mock.timers.tick(STAGE_A_POLICY.upstreamTimeoutMs - 1); assert.equal(signal?.aborted, false);
  monotonic++; t.mock.timers.tick(1); assert.equal(signal?.aborted, true); await rejected;
});

test("local mock HTTP: body timeout closes the connection and redirect makes no second request", async t => {
  let requests = 0; let closeResponse: () => void = () => {};
  const closed = new Promise<void>(resolve => { closeResponse = resolve; });
  const server = createServer((req, res) => {
    requests++;
    if (req.url === "/redirect") { res.writeHead(302, { location: "/unexpected" }); res.end(); }
    else { res.writeHead(200, { "content-type": "application/json" }); res.write('{"status":'); res.on("close", closeResponse); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const start = performance.now();
  const transport = createAmapTransport(async (_url, init) => fetch(`${origin}/slow-body`, init), { policy: { upstreamTimeoutMs: 100, maxResponseBytes: 100 } });
  await assert.rejects(transport.requestJson(url, "geocode"), hasCode("UPSTREAM_TIMEOUT"));
  const timeoutDurationMs = performance.now() - start;
  let releaseTimer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([closed, new Promise<never>((_, reject) => { releaseTimer = setTimeout(() => reject(Error("mock connection not released")), 1500); })]); }
  finally { clearTimeout(releaseTimer); }
  const releasedAfterMs = performance.now() - start;
  const redirect = createAmapTransport(async (_url, init) => fetch(`${origin}/redirect`, init), { policy: { upstreamTimeoutMs: 500, maxResponseBytes: 100 } });
  await assert.rejects(redirect.requestJson(url, "geocode"), hasCode("UPSTREAM_NETWORK"));
  assert.equal(requests, 2);
  t.diagnostic(JSON.stringify({ mockTimeoutMs: 100, timeoutDurationMs: Math.round(timeoutDurationMs), connectionClosedAfterMs: Math.round(releasedAfterMs), requests, redirectFollowed: false }));
});

test("late non-cooperative fetch response is cancelled after timeout", async () => {
  let finish: (response: Response) => void = () => {}; let cancelled = false;
  const pending = createAmapTransport(async () => new Promise<Response>(resolve => { finish = resolve; }), { policy: { ...policy, upstreamTimeoutMs: 5 } }).requestJson(url, "geocode");
  await assert.rejects(pending, hasCode("UPSTREAM_TIMEOUT"));
  finish(streamResponse([], () => { cancelled = true; }, false));
  await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(cancelled, true);
});

test("1 MiB candidate permits exact byte size and rejects one extra byte", async () => {
  const prefix = '{"status":"1","padding":"'; const suffix = '"}';
  const body = prefix + "x".repeat(STAGE_A_POLICY.maxResponseBytes - prefix.length - suffix.length) + suffix;
  assert.equal(new TextEncoder().encode(body).length, STAGE_A_POLICY.maxResponseBytes);
  const success = createAmapTransport(async () => new Response(body));
  assert.equal((await success.requestJson(url, "geocode")).status, "1");
  await assert.rejects(createAmapTransport(async () => new Response(body + " ")).requestJson(url, "geocode"), hasCode("UPSTREAM_BODY_TOO_LARGE"));
});

test("explicit cancellation during body read cancels reader, not a timeout", async () => {
  let cancelled = false;
  const parent = new AbortController(); const context = createRequestContext(parent.signal);
  const transport = createAmapTransport(async () => {
    setTimeout(() => parent.abort(), 5);
    return streamResponse([], () => { cancelled = true; }, false);
  }, { context });
  await assert.rejects(transport.requestJson(url, "geocode"), hasCode("REQUEST_CANCELLED"));
  assert.equal(cancelled, true); context.dispose();
});

test("diagnostic timing stages and safe failure identity survive transport extraction", async () => {
  const stages: string[] = []; const annotations = new Map<unknown, unknown>();
  const diagnostics: Diagnostics = {
    async measure(stage, operation) { stages.push(stage); return operation(); },
    measureSync(stage, operation) { stages.push(stage); return operation(); },
    event() {}, error() {}, annotate(error, type, code) { annotations.set(error, { type, code }); },
  };
  await createAmapTransport(async () => Response.json({ status: "1" }), { diagnostics }).requestJson(url, "geocode");
  assert.deepEqual(stages, ["amap.fetch", "amap.read", "amap.json", "amap.validate"]);
  await assert.rejects(createAmapTransport(async () => Response.json({ status: "0", info: "SECRET", infocode: "10021" }), { diagnostics }).requestJson(url, "geocode"), error => {
    assert.deepEqual(annotations.get(error), { type: "upstream_business", code: "10021" }); return true;
  });
  await assert.rejects(createAmapTransport(async () => new Promise<Response>(() => {}), { diagnostics, policy: { ...policy, upstreamTimeoutMs: 5 } }).requestJson(url, "geocode"), error => {
    assert.deepEqual(annotations.get(error), { type: "timeout", code: "UPSTREAM_TIMEOUT" }); return true;
  });
});
