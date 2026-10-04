import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createSearchHistoryStore, type SearchHistoryItem } from "../src/web/search-history-store.js";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const rows = (count: number): SearchHistoryItem[] => Array.from({ length: count }, (_, i) => ({
  id: `h-${i}`, query: `地点 ${i}`, categoryIds: ["food"], radiusMeters: 3000,
  searchedAt: new Date(Date.UTC(2026, 9, 4) - i * 1000).toISOString(),
}));

function fixture(t: TestContext, options: { timeoutMs?: number; prefetchDelayMs?: number } = {}) {
  const calls: Array<{ method: string; url: string; body?: string | null }> = [];
  const requests: Array<{ resolve: (r: Response) => void; reject: (e: Error) => void }> = [];
  let clock = 0;
  const fetcher = ((url: string, init: RequestInit) => {
    calls.push({ method: init.method!, url, body: init.body as string | null });
    return new Promise<Response>((resolve, reject) => { requests.push({ resolve, reject }); });
  }) as typeof fetch;
  const store = createSearchHistoryStore({ fetch: fetcher, now: () => clock, prefetchDelayMs: 60_000, ...options });
  store.start();
  t.after(() => store.stop());
  return {
    store, calls, requests,
    reply(payload: unknown, status = 200) {
      const request = requests.shift();
      assert.ok(request, "a request must have started");
      request.resolve(Response.json(payload, { status }));
    },
    fail() { requests.shift()!.reject(new TypeError("Network failed")); },
    advance(ms: number) { clock += ms; },
    async load(items: SearchHistoryItem[]) {
      const promise = store.refresh();
      await tick();
      this.reply({ items });
      assert.equal(await promise, true);
    },
  };
}

test("history deduplicates prefetch/open reads, including cached empty results", async (t) => {
  const f = fixture(t);
  const first = f.store.refresh();
  assert.equal(f.store.refresh(), first);
  await tick();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0]?.url, "/api/history?limit=20");
  f.reply({ items: [] });
  await first;
  await f.store.refresh();
  assert.equal(f.calls.length, 1);
  assert.equal(f.store.getSnapshot().hasLoaded, true);
});

test("background refresh keeps existing items and failed reads do not erase them", async (t) => {
  const f = fixture(t);
  await f.load(rows(20));
  f.advance(30_001);
  const refresh = f.store.refresh();
  assert.equal(f.store.getSnapshot().items.length, 10);
  assert.equal(f.store.getSnapshot().loading, true);
  await tick();
  f.reply({}, 503);
  assert.equal(await refresh, false);
  assert.equal(f.store.getSnapshot().items[0]?.id, "h-0");
  assert.match(f.store.getSnapshot().loadError!, /上次记录/);
});

test("deletion and reserve promotion happen before DELETE or refill returns", async (t) => {
  const f = fixture(t);
  await f.load(rows(20));
  const deletion = f.store.remove("h-0");
  assert.equal(f.store.getSnapshot().items[0]?.id, "h-1");
  assert.equal(f.store.getSnapshot().items[9]?.id, "h-10");
  assert.equal(f.store.getSnapshot().loading, false);
  await tick();
  assert.equal(f.calls.at(-1)?.method, "DELETE");
  f.reply({ deleted: true });
  await deletion;
  assert.equal(f.store.getSnapshot().pendingDeleteCount, 0);
  assert.equal(f.store.getSnapshot().items[0]?.id, "h-1");
});

test("multiple deletes are immediate, ordered, deduplicated and rolled back per item", async (t) => {
  const f = fixture(t);
  await f.load(rows(20));
  const a = f.store.remove("h-0");
  const b = f.store.remove("h-1");
  await f.store.remove("h-0");
  assert.equal(f.store.getSnapshot().items[0]?.id, "h-2");
  assert.equal(f.store.getSnapshot().pendingDeleteCount, 2);
  await tick();
  f.reply({ deleted: true });
  await a;
  await tick();
  f.reply({ error: "Forbidden" }, 403);
  await b;
  assert.equal(f.calls.filter((call) => call.method === "DELETE").length, 2);
  assert.equal(f.store.getSnapshot().items.some((item) => item.id === "h-0"), false);
  assert.equal(f.store.getSnapshot().items[0]?.id, "h-1");
  assert.match(f.store.getSnapshot().deleteError!, /删除失败/);
});

test("a read started before a delete cannot briefly resurrect the deleted row", async (t) => {
  const f = fixture(t);
  const items = rows(20);
  await f.load(items);
  const refresh = f.store.refresh(true);
  await tick();
  const deletion = f.store.remove("h-0");
  const visible: string[][] = [];
  const unsubscribe = f.store.subscribe(() => visible.push(f.store.getSnapshot().items.map((item) => item.id)));
  f.reply({ items });
  await refresh;
  await tick();
  assert.ok(visible.every((ids) => !ids.includes("h-0")));
  f.reply({ deleted: true });
  await deletion;
  unsubscribe();
});

test("lost DELETE response is reconciled without submitting a second delete", async (t) => {
  const f = fixture(t);
  await f.load(rows(5));
  const deletion = f.store.remove("h-0");
  await tick();
  f.fail();
  await tick();
  assert.equal(f.calls.at(-1)?.method, "GET");
  f.reply({ items: rows(5).slice(1) });
  await deletion;
  assert.equal(f.store.getSnapshot().deleteError, null);
  assert.equal(f.store.getSnapshot().items.some((item) => item.id === "h-0"), false);
  assert.equal(f.calls.filter((call) => call.method === "DELETE").length, 1);
});

test("an ambiguous delete restores only its item when reconciliation also fails", async (t) => {
  const f = fixture(t);
  await f.load(rows(5));
  const deletion = f.store.remove("h-0");
  await tick();
  f.reply({}, 404);
  await tick();
  f.reply({}, 503);
  await deletion;
  assert.equal(f.store.getSnapshot().items[0]?.id, "h-0");
  assert.match(f.store.getSnapshot().deleteError!, /无法确认/);
});

test("absence outside a truncated history window is not proof of deletion", async (t) => {
  const f = fixture(t);
  const original = rows(5);
  await f.load(original);
  const deletion = f.store.remove("h-0");
  await tick();
  f.fail();
  await tick();
  const newer = rows(20).map((row, i) => ({ ...row, id: `new-${i}`, searchedAt: "2026-10-05T00:00:00.000Z" }));
  f.reply({ items: newer });
  await deletion;
  assert.match(f.store.getSnapshot().deleteError!, /无法确认/);
  assert.equal(f.store.getSnapshot().items[0]?.id, "h-0");
});

test("saving shares visitor request ordering and uses the returned normalized item", async (t) => {
  const f = fixture(t);
  const read = f.store.refresh();
  const saved = { ...rows(1)[0]!, id: "saved", query: "规范化地点" };
  const save = f.store.save({ query: " 规范化地点 ", categoryIds: ["food"], radiusMeters: 3000 });
  await tick();
  assert.deepEqual(f.calls.map((call) => call.method), ["GET"]);
  f.reply({ items: [] });
  await read;
  await tick();
  assert.deepEqual(f.calls.map((call) => call.method), ["GET", "POST"]);
  f.reply({ item: saved });
  await save;
  assert.equal(f.store.getSnapshot().items[0]?.id, "saved");
  assert.equal(f.store.getSnapshot().items[0]?.query, "规范化地点");
});

test("read timeout ends loading even if the transport never rejects on abort", async (t) => {
  const f = fixture(t, { timeoutMs: 15 });
  const read = f.store.refresh();
  assert.equal(await read, false);
  assert.equal(f.store.getSnapshot().loading, false);
  assert.equal(f.store.getSnapshot().hasLoaded, false);
  assert.match(f.store.getSnapshot().loadError!, /失败/);
});

test("Strict Mode start/stop/start only schedules one prefetch and teardown cancels a read", async (t) => {
  const f = fixture(t, { prefetchDelayMs: 5 });
  f.store.stop();
  f.store.start();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(f.calls.length, 1);
  const pending = f.store.refresh();
  f.store.stop();
  await pending;
  assert.equal(f.store.getSnapshot().loading, false);
  assert.equal(f.store.getSnapshot().loadError, null);
});
