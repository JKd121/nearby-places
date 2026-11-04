import { test as base, expect, type Page } from "@playwright/test";
import { CATEGORIES } from "../src/amap/categories";
import type { CategoryKey, CategorySearchResult, Place } from "../src/amap/types";
import type { SearchResponse } from "../src/search/contracts";

export const center = {
  id: "synthetic-east", name: "合成测试中心东区", placeType: "测试地点",
  city: "测试市", district: "测试区", address: "合成地址一号",
  location: { longitude: 114.03, latitude: 22.61 },
};
export const west = { ...center, id: "synthetic-west", name: "合成测试中心西区", location: { longitude: 114.02, latitude: 22.61 } };

export function places(key: CategoryKey, count = 1, start = 1): Place[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `synthetic-${key}-${start + index}`, name: `合成${key}地点${start + index}`, category: key,
    ...center.location, address: "合成周边地址", parentId: null,
    distanceMeters: start + index, distanceSource: "amap", amapDistanceMeters: start + index,
    computedDistanceMeters: start + index, type: null, typecode: null, cost: null,
    rating: (start + index) % 2 ? 4 : 5, tag: null, openTimeToday: null, openTimeWeek: null,
  }));
}

export function searchResponse(keys: CategoryKey[], mode = "success", count = 1): SearchResponse {
  const categories: CategorySearchResult[] = keys.map((key, index) => {
    const failed = mode === "all-error" || (mode === "partial" && index === 1);
    return {
      category: CATEGORIES.find(category => category.key === key)!,
      status: failed ? "error" : count === 0 ? "empty" : "success", places: failed ? [] : places(key, count),
      page: failed ? null : { pageNumber: 1, pageSize: 25, returnedCount: count, mayHaveNextApiPage: count === 25 },
      error: failed ? { code: "SERVICE_UNAVAILABLE", message: "合成上游暂不可用", info: null, infocode: null } : null,
    };
  });
  return {
    status: mode === "success" ? "success" : "partial success",
    resolvedLocation: { ...center.location, query: "合成测试", formattedAddress: center.address, province: null, city: center.city, district: center.district, level: null },
    categories,
  };
}

export async function installApiMocks(page: Page, realHistory = false) {
  const state = {
    mode: "success", count: 1, pageFails: true,
    searches: [] as Array<{ categoryIds: CategoryKey[]; radiusMeters: number; center: typeof center.location }>,
    resolveCalls: 0, pageCalls: 0, unexpected: [] as string[],
    requests: [] as Array<{ method: string; path: string; body: unknown }>,
  };
  const allowedOrigin = realHistory ? "http://127.0.0.1:3120" : "http://127.0.0.1:3119";
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.origin !== allowedOrigin || !url.pathname.startsWith("/api/")) return;
    let body: unknown = null;
    try { body = request.postDataJSON(); } catch { body = "<invalid JSON>"; }
    state.requests.push({ method: request.method(), path: url.pathname, body });
  });
  let history: Array<Record<string, unknown>> = [];
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== allowedOrigin) {
      state.unexpected.push(`${request.method()} ${url.origin}${url.pathname}`);
      await route.abort(); return;
    }
    if (!url.pathname.startsWith("/api/")) { await route.continue(); return; }
    if (url.pathname === "/api/history" && realHistory) { await route.continue(); return; }
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    const body = request.method() === "GET" ? null : request.postDataJSON();
    const methods: Record<string, string[]> = { "/api/history": ["GET", "POST", "DELETE"], "/api/resolve-location": ["POST"], "/api/search": ["POST"], "/api/search/page": ["POST"] };
    if (!methods[url.pathname]?.includes(request.method())) {
      state.unexpected.push(`${request.method()} ${url.pathname}`);
      await json({ error: "Unexpected fixture method" }, 500); return;
    }
    switch (url.pathname) {
      case "/api/resolve-location":
        state.resolveCalls++;
        await json({ status: "needs_confirmation", candidates: [center, west] }); return;
      case "/api/search":
        state.searches.push(body);
        if (state.mode === "timeout") { await json({ error: { code: "UPSTREAM_TIMEOUT", message: "合成请求超时，请稍后再试" } }, 504); return; }
        await json(searchResponse(body.categoryIds, state.mode, state.count)); return;
      case "/api/search/page":
        state.pageCalls++;
        if (state.pageFails) { await json({ error: { message: "合成分页失败" } }, 502); return; }
        await json({ categoryId: body.categoryId, page: { places: places(body.categoryId, 1, 26), pageNumber: 2, pageSize: 25, returnedCount: 1, mayHaveNextApiPage: false } }); return;
      case "/api/history":
        if (request.method() === "POST") {
          const item = { ...body, id: "synthetic-history", searchedAt: new Date().toISOString() };
          history = [item]; await json({ item }); return;
        }
        if (request.method() === "DELETE") { history = history.filter(item => item.id !== body.id); await json({ deleted: true }); return; }
        await json({ items: history }); return;
      default:
        state.unexpected.push(`${request.method()} ${url.pathname}`);
        await json({ error: "Unexpected fixture request" }, 500);
    }
  });
  return state;
}

export async function confirmCenter(page: Page) {
  await page.getByRole("textbox", { name: "地点", exact: true }).fill("合成测试中心");
  await page.getByRole("button", { name: "解析地点", exact: true }).click();
  await page.getByRole("button", { name: `选用此地点：${center.name}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: "搜索中心已确认", exact: true })).toBeVisible();
}

export async function selectHotel(page: Page) {
  await page.getByRole("button", { name: "清空", exact: true }).click();
  await page.getByRole("checkbox", { name: "酒店", exact: true }).check();
}

export const test = base.extend<{ api: Awaited<ReturnType<typeof installApiMocks>> }>({
  api: [async ({ page }, use, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const api = await installApiMocks(page);
    try { await use(api); } finally {
      await testInfo.attach("api-requests", { body: JSON.stringify({ requests: api.requests, unexpected: api.unexpected }, null, 2), contentType: "application/json" });
      await testInfo.attach("browser-errors", { body: JSON.stringify(errors), contentType: "application/json" });
      if (!page.isClosed()) await testInfo.attach("final-state", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
    }
    expect(api.unexpected, "all application requests must have an explicit fixture").toEqual([]);
    expect(errors, "browser has no unhandled exceptions").toEqual([]);
  }, { auto: true }],
});
export { expect };
