import assert from "node:assert/strict";
import { test } from "node:test";
import { localHistoryFetch, GUEST_HISTORY_KEY } from "../src/web/local-history.js";
import { confirmedLocation } from "./history-fixtures.js";

const body = { query: "深圳北站", categoryIds: ["hotel"], radiusMeters: 3000, confirmedLocation };
function fixture() {
  const rows = new Map<string, string>();
  const storage = { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key, value); } };
  return { rows, storage, fetch: localHistoryFetch(storage) };
}
test("anonymous history persists across store recreation without any network", async () => {
  const f = fixture();
  await f.fetch("/api/history", { method: "POST", body: JSON.stringify(body) });
  const result = await (await localHistoryFetch(f.storage)("/api/history")).json();
  assert.equal(result.items[0].query, body.query);
  assert.deepEqual(result.items[0].confirmedLocation, confirmedLocation);
});
test("anonymous history deduplicates and retains only twenty records", async () => {
  const f = fixture();
  for (let i = 0; i < 25; i++) await f.fetch("/api/history", { method: "POST", body: JSON.stringify({ ...body, query: "地点" + i }) });
  await f.fetch("/api/history", { method: "POST", body: JSON.stringify({ ...body, query: "地点24" }) });
  const items = (await (await f.fetch("/api/history")).json()).items;
  assert.equal(items.length, 20); assert.equal(items[0].query, "地点24");
  await f.fetch("/api/history", { method: "DELETE", body: JSON.stringify({ id: items[0].id }) });
  assert.equal((await (await f.fetch("/api/history")).json()).items.length, 19);
});
test("corrupt local data recovers and clearing storage removes anonymous history", async () => {
  const f = fixture(); f.rows.set(GUEST_HISTORY_KEY, "{broken");
  assert.deepEqual(await (await f.fetch("/api/history")).json(), { items: [] });
  await f.fetch("/api/history", { method: "POST", body: JSON.stringify(body) });
  f.rows.delete(GUEST_HISTORY_KEY);
  assert.deepEqual(await (await f.fetch("/api/history")).json(), { items: [] });
});
