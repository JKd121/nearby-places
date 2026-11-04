import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { test, expect, type APIRequestContext } from "@playwright/test";
import { center, confirmCenter, installApiMocks, selectHotel } from "../fixtures";

// Config/global setup validates this dedicated URL before the server starts.
const pool = new Pool({ connectionString: process.env.NEARBY_HISTORY_TEST_DATABASE_URL, connectionTimeoutMillis: 3_000 });
const visitors = new Set<string>();
const input = { query: "合成历史测试", categoryIds: ["hotel"], radiusMeters: 3000, confirmedLocation: center };

test.afterEach(async ({ context }) => {
  for (const cookie of await context.cookies()) if (cookie.name === "nearby_visitor_id") visitors.add(cookie.value);
  if (visitors.size) await pool.query('DELETE FROM "SearchHistory" WHERE "visitorId" = ANY($1::text[])', [[...visitors]]);
  visitors.clear();
});
test.afterAll(async () => { await pool.end(); });

async function client(request: APIRequestContext) {
  const response = await request.get("/api/history");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ items: [] });
  const cookie = response.headers()["set-cookie"]!;
  expect(cookie).toContain("HttpOnly");
  expect(cookie.toLowerCase()).toContain("samesite=lax");
  expect(cookie.toLowerCase()).toContain("secure");
  const header = cookie.split(";")[0]!;
  visitors.add(header.slice(header.indexOf("=") + 1));
  // Forward the production Secure cookie explicitly over this loopback HTTP fixture.
  return { headers: { cookie: header } };
}

test("HTTP → Next Route → Prisma → PostgreSQL：保存、规范化去重、读取和删除", async ({ request }) => {
  const auth = await client(request);
  const saved = await request.post("/api/history", { ...auth, data: { ...input, query: "  合成   历史  " } });
  expect(saved.status()).toBe(200);
  const { item } = await saved.json();
  expect(item).toMatchObject({ query: "合成 历史", confirmedLocation: center });
  expect(item).not.toHaveProperty("visitorId");
  expect(item).not.toHaveProperty("dedupeKey");
  const duplicate = await request.post("/api/history", { ...auth, data: { ...input, query: "合成 历史" } });
  expect(duplicate.status()).toBe(200);
  expect((await duplicate.json()).item.id).toBe(item.id);
  const rows = await pool.query('SELECT * FROM "SearchHistory" WHERE id=$1', [item.id]);
  expect(rows.rowCount).toBe(1);
  expect(rows.rows[0].confirmedLocation).toEqual(center);
  const refreshed = await request.get("/api/history?limit=20", auth);
  expect(refreshed.status()).toBe(200);
  expect((await refreshed.json()).items).toEqual([expect.objectContaining({ id: item.id, confirmedLocation: center })]);
  expect(refreshed.headers()["cache-control"]).toBe("private, no-store");
  expect((await request.delete("/api/history", { ...auth, data: { id: item.id } })).status()).toBe(200);
  expect((await pool.query('SELECT id FROM "SearchHistory" WHERE id=$1', [item.id])).rowCount).toBe(0);
  expect(await (await request.get("/api/history", auth)).json()).toEqual({ items: [] });
});

test("两个访客各自保存与读取，越权删除返回 404，原记录保持", async ({ request, playwright, baseURL }) => {
  const owner = await client(request);
  const otherRequest = await playwright.request.newContext({ baseURL });
  try {
    const other = await client(otherRequest);
    const saved = await request.post("/api/history", { ...owner, data: input });
    expect(saved.status()).toBe(200);
    const { item } = await saved.json();
    const isolated = await otherRequest.get("/api/history", other);
    expect(await isolated.json()).toEqual({ items: [] });
    expect((await otherRequest.delete("/api/history", { ...other, data: { id: item.id } })).status()).toBe(404);
    const otherSaved = await otherRequest.post("/api/history", { ...other, data: input });
    expect(otherSaved.status()).toBe(200);
    const otherItem = (await otherSaved.json()).item;
    expect(otherItem.id).not.toBe(item.id);
    expect((await (await request.get("/api/history", owner)).json()).items.map((entry: { id: string }) => entry.id)).toEqual([item.id]);
    expect((await (await otherRequest.get("/api/history", other)).json()).items.map((entry: { id: string }) => entry.id)).toEqual([otherItem.id]);
    expect((await pool.query('SELECT id FROM "SearchHistory" WHERE id = ANY($1::text[])', [[item.id, otherItem.id]])).rowCount).toBe(2);
  } finally { await otherRequest.dispose(); }
});

test("无效输入返回 400，并保持数据库无新增", async ({ request }) => {
  const auth = await client(request);
  for (const data of [{ ...input, radiusMeters: 999 }, { ...input, confirmedLocation: null }, { ...input, visitorId: randomUUID() }]) {
    expect((await request.post("/api/history", { ...auth, data })).status()).toBe(400);
  }
  const result = await pool.query('SELECT id FROM "SearchHistory" WHERE "visitorId" = ANY($1::text[])', [[...visitors]]);
  expect(result.rowCount).toBe(0);
});

test("浏览器搜索后真实保存，刷新与回放复用原中心，删除落库", async ({ page }) => {
  const api = await installApiMocks(page, true);
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto("/");
  await confirmCenter(page); await selectHotel(page);
  const saved = page.waitForResponse(response => response.url().endsWith("/api/history") && response.request().method() === "POST");
  await page.getByRole("button", { name: "搜索附近", exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(200);
  const { item } = await response.json();
  const cookie = (await page.context().cookies()).find(entry => entry.name === "nearby_visitor_id");
  expect(cookie).toBeTruthy();
  visitors.add(cookie!.value);
  expect((await pool.query('SELECT "confirmedLocation" FROM "SearchHistory" WHERE id=$1', [item.id])).rows[0].confirmedLocation).toEqual(center);
  await page.reload();
  await page.getByRole("button", { name: "最近搜索", exact: true }).click();
  const replaySave = page.waitForResponse(result => result.url().endsWith("/api/history") && result.request().method() === "POST");
  await page.getByRole("region", { name: "搜索历史" }).getByRole("button", { name: new RegExp(`^${center.name}`) }).click();
  await page.getByRole("button", { name: /^酒店/ }).click();
  await expect(page.getByRole("heading", { name: "合成hotel地点1", exact: true })).toBeVisible();
  expect((await (await replaySave).json()).item.id).toBe(item.id);
  expect(api.resolveCalls).toBe(1);
  expect(api.searches).toEqual([expect.objectContaining({ center: center.location, categoryIds: ["hotel"], radiusMeters: 3000 }), expect.objectContaining({ center: center.location, categoryIds: ["hotel"], radiusMeters: 3000 })]);
  await page.getByRole("button", { name: "最近搜索", exact: true }).click();
  const deleted = page.waitForResponse(result => result.url().endsWith("/api/history") && result.request().method() === "DELETE");
  await page.getByRole("button", { name: `删除这条搜索历史：${center.name}`, exact: true }).click();
  expect((await deleted).status()).toBe(200);
  await expect(page.getByText("暂无搜索历史", { exact: true })).toBeVisible();
  expect((await pool.query('SELECT id FROM "SearchHistory" WHERE id=$1', [item.id])).rowCount).toBe(0);
  expect(api.unexpected).toEqual([]);
  expect(pageErrors).toEqual([]);
});
