import { test, expect, type Page } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { CATEGORIES } from "../../src/amap/categories.js";
import type { CategoryKey, CategorySearchResult, Place } from "../../src/amap/types.js";
import { confirmedLocation } from "../history-fixtures.js";

const center = { ...confirmedLocation, location: { longitude: 114.03, latitude: 22.61 } };
function results(count = 500, overlap = false): CategorySearchResult[] {
  return CATEGORIES.map((category, categoryIndex) => {
    const places: Place[] = Array.from({ length: Math.floor(count / 10) }, (_, index) => {
      const n = categoryIndex * Math.floor(count / 10) + index;
      return { id: `poi-${n}`, category: category.key, name: `${category.label}测试店铺${index + 1}`, longitude: 114.03 + (overlap ? 0 : ((n % 20) - 9.5) * .0018), latitude: 22.61 + (overlap ? 0 : (Math.floor(n / 20) - 12) * .0014),
        parentId: null, address: "深圳市测试地址", type: null, typecode: null, distanceMeters: index * 10 + 20, distanceSource: "amap", amapDistanceMeters: index * 10 + 20, computedDistanceMeters: index * 10 + 20,
        rating: 4.5, cost: 50, tag: null, openTimeToday: null, openTimeWeek: null };
    });
    return { category, places, status: "success", error: null, page: { pageNumber: 1, pageSize: 25, returnedCount: 25, mayHaveNextApiPage: true } };
  });
}

async function setup(page: Page, options: { count?: number; overlap?: boolean; failure?: boolean; slow?: boolean } = {}) {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  let identity = true, sdkFailure = options.failure ?? false;
  let categories = results(options.count ?? 500, options.overlap);
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/identity") return route.fulfill({ json: identity ? { kind: "guest", id: "map-fixture", accessMode: "verified" } : { kind: "none", accessMode: "verified" } });
    if (path === "/api/guest/usage") return route.fulfill({ json: { remaining: 60, limit: 60, resetsAt: "2027-01-01" } });
    if (path === "/api/guest/session") { identity = false; return route.fulfill({ json: { ok: true } }); }
    if (path === "/api/maps/config") return route.fulfill({ json: { key: "f".repeat(32), serviceHost: "/api/maps/_AMapService" } });
    if (path === "/api/resolve-location") return route.fulfill({ json: { status: "confirmed", location: center } });
    if (path === "/api/search/page") {
      const { categoryId } = route.request().postDataJSON() as { categoryId: CategoryKey };
      const category = categories.find(item => item.category.key === categoryId)!;
      const places = category.places.slice(0, 25).map(place => ({ ...place, id: place.id + "-page2", name: place.name + "第二页" }));
      return route.fulfill({ json: { categoryId, page: { places, pageNumber: 2, pageSize: 25, returnedCount: 25, mayHaveNextApiPage: true } } });
    }
    if (path === "/api/search") {
      const body = route.request().postDataJSON() as { categoryIds: CategoryKey[] };
      const selected = categories.filter(item => body.categoryIds.includes(item.category.key));
      if (options.slow) await new Promise(resolve => setTimeout(resolve, 600));
      const location = { query: "深圳北站", formattedAddress: center.address, province: null, city: center.city, district: center.district, level: "兴趣点", ...center.location };
      const progress = { type: "progress", progress: { results: selected.slice(0, 2), active: ["hotpot"], pending: [] } };
      return route.fulfill({ contentType: "application/x-ndjson", body: JSON.stringify(progress) + "\n" + JSON.stringify({ type: "complete", response: { resolvedLocation: location, categories: selected, status: "success" } }) + "\n" });
    }
    throw new Error(`Unexpected API request: ${path}`);
  });
  await page.route("https://webapi.amap.com/**", async route => {
    if (sdkFailure) { sdkFailure = false; return route.abort(); }
    return route.fulfill({ contentType: "application/javascript", body: await readFile("test/map-e2e/fake-sdk.js", "utf8") });
  });
  await page.route(/https:\/\/.*(?:amap\.com|autonavi\.com)\//, route => { throw new Error(`Unexpected upstream ${new URL(route.request().url()).hostname}`); });
  // More recently registered routes run first; register the SDK after the network guard.
  await page.unroute("https://webapi.amap.com/**");
  await page.route("https://webapi.amap.com/**", async route => {
    if (sdkFailure) { sdkFailure = false; return route.abort(); }
    return route.fulfill({ contentType: "application/javascript", body: await readFile("test/map-e2e/fake-sdk.js", "utf8") });
  });
  await page.goto("/"); await expect(page.getByLabel("地点", { exact: true })).toBeVisible();
  let revision = 0;
  return { errors, replace: (count: number, overlap = false) => {
    revision++;
    categories = results(count, overlap).map(category => ({ ...category, places: category.places.map(place => ({ ...place, id: `${place.id}-r${revision}` })) }));
  } };
}
async function resolveCenter(page: Page) {
  await page.getByLabel("地点", { exact: true }).fill("深圳北站"); await page.getByRole("button", { name: "解析地点", exact: true }).click();
}
async function search(page: Page) {
  await page.getByRole("button", { name: "搜索附近", exact: true }).click();
  await expect(page.getByRole("button", { name: "搜索附近", exact: true })).toBeEnabled();
}
async function harness(page: Page) { return page.evaluate(() => (window as unknown as { __mapHarness: { liveMaps: number; created: number; destroyed: number; listeners: number; updates: number; submitted: number; groups: string[][] } }).__mapHarness); }

test("streamed results light the map while searching, and interruption preserves points and stops radar", async ({ page }) => {
  const partial = results(250).slice(0, 2);
  await page.addInitScript(({ partial }) => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url, location.origin);
      if (url.pathname !== "/api/search") return original(input, init);
      const encoder = new TextEncoder();
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: "progress", progress: { results: partial, active: ["hotpot"], pending: ["bakery"] } }) + "\n"));
        (window as unknown as { interruptMapStream: () => void }).interruptMapStream = () => controller.close();
      } }), { headers: { "content-type": "application/x-ndjson" } });
    };
  }, { partial });
  const fixture = await setup(page, { count: 250 }); await resolveCenter(page);
  await expect(page.locator('[data-map-state="ready"]')).toBeVisible();
  await page.getByRole("button", { name: "搜索附近", exact: true }).click();
  await expect(page.getByText("正在搜索附近", { exact: true })).toBeVisible();
  await expect(page.getByText("本次已获取")).toContainText("50");
  const painted = () => page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".nearby-map-radar")!;
    return canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data.some(value => value > 0);
  });
  await expect.poll(painted).toBe(true);
  await page.screenshot({ path: "harness/build/map-search-2026-11-08/radar-searching.png", fullPage: true, animations: "disabled" });
  await page.evaluate(() => (window as unknown as { interruptMapStream: () => void }).interruptMapStream());
  await expect(page.getByText("附近搜索未完成", { exact: true })).toBeVisible();
  await expect(page.getByText("本次已获取")).toContainText("50"); await expect.poll(painted).toBe(false);
  expect(fixture.errors).toEqual([]);
});

test("desktop: grouped conditions, density, selection, sorting, second page and screenshots", async ({ page }) => {
  const fixture = await setup(page);
  const group = page.getByRole("button", { name: /^娱乐 / });
  await expect(group.locator('svg[data-category-icon="entertainment"]')).toHaveCount(1);
  const resting = await group.evaluate(element => getComputedStyle(element).boxShadow);
  expect(resting).toContain("4px 4px 0px");
  await group.hover();
  await expect.poll(() => group.evaluate(element => getComputedStyle(element).boxShadow)).toContain("6px 6px 0px");
  await group.click();
  for (const icon of ["ktv", "billiards", "gym"]) await expect(page.locator(`#category-group-entertainment svg[data-category-icon="${icon}"]`)).toBeVisible();
  await page.keyboard.press("Escape");
  const toolbar = page.getByRole("region", { name: "搜索条件" });
  expect(await toolbar.evaluate(element => getComputedStyle(element).borderTopWidth)).toBe("0px");
  const toolbarBox = await toolbar.boundingBox(), resultBox = await page.getByRole("region", { name: "附近结果", exact: true }).boundingBox();
  expect(toolbarBox!.y + toolbarBox!.height).toBeLessThanOrEqual(resultBox!.y);
  await expect(page.getByText("从一个地点展开探索")).toBeVisible();
  await page.getByRole("button", { name: /^餐饮 / }).click(); await expect(page.getByLabel("火锅", { exact: true })).toBeVisible();
  await page.getByLabel("火锅", { exact: true }).uncheck(); await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /^餐饮 / })).toHaveAttribute("aria-expanded", "false");
  await resolveCenter(page); await expect(page.locator('[data-map-state="ready"]')).toBeVisible();
  await search(page); await expect(page.getByText("本次已获取")).toContainText("500");
  await expect.poll(async () => (await harness(page)).submitted).toBeGreaterThan(0);
  expect((await harness(page)).groups.length).toBeLessThan(100);
  const hotel = page.getByRole("button", { name: /^酒店 50 个地点/ }); await expect(hotel).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: /^在地图定位：/ })).toHaveCount(0);
  await page.screenshot({ path: "harness/build/map-search-2026-11-08/desktop-clustered.png", fullPage: true, animations: "disabled" });
  await page.locator('.nearby-map-point').first().click();
  const members = page.getByRole("region", { name: "聚合内的地点" }); await expect(members).toBeVisible();
  await members.locator("li button").first().click(); await expect(page.locator('.nearby-map-selected')).toBeVisible();
  await expect(page.locator('.nearby-map-selected svg')).toHaveCount(1);
  await expect(page.locator('[data-selected="true"]')).toBeVisible();
  if (await hotel.getAttribute("aria-expanded") !== "true") await hotel.click();
  await page.getByLabel("酒店排序").selectOption("rating-desc");
  await page.getByRole("button", { name: "加载更多（已显示 10/50）", exact: true }).first().click();
  const section = hotel.locator("xpath=ancestor::section[1]");
  while (await section.getByRole("button", { name: /^加载更多/ }).count()) await section.getByRole("button", { name: /^加载更多/ }).click();
  await section.getByRole("button", { name: "获取更多附近结果", exact: true }).click();
  await expect(page.getByText("本次已获取")).toContainText("525");
  await page.screenshot({ path: "harness/build/map-search-2026-11-08/desktop-selected.png", fullPage: true, animations: "disabled" });
  expect(fixture.errors).toEqual([]);
});

test("mobile: loading failure retry, hidden-map pause, same-coordinate member pagination and identity cleanup", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await setup(page, { overlap: true, failure: true }); await resolveCenter(page);
  await page.getByRole("button", { name: "地图", exact: true }).click();
  await expect(page.getByRole("button", { name: "重试地图" })).toBeVisible(); await page.getByRole("button", { name: "重试地图" }).click();
  await expect(page.locator('[data-map-state="ready"]')).toBeVisible(); await search(page);
  await page.getByRole("button", { name: "查看聚合的 500 个地点" }).click();
  const members = page.getByRole("region", { name: "聚合内的地点" }); await expect(members.locator("li")).toHaveCount(20);
  await members.getByRole("button", { name: "再显示 20 个地点" }).click(); await expect(members.locator("li")).toHaveCount(40);
  await members.locator("li button").nth(30).click();
  await expect(page.getByRole("button", { name: "列表", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-selected="true"]')).toBeVisible();
  await page.getByRole("button", { name: "地图", exact: true }).click();
  await page.screenshot({ path: "harness/build/map-search-2026-11-08/mobile-selected.png", fullPage: true, animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "退出体验", exact: true }).click();
  await expect.poll(async () => (await harness(page)).liveMaps).toBe(0);
  expect((await harness(page)).listeners).toBe(0); expect(fixture.errors).toEqual([]);
});

test("20 search/center/view cycles release SDK objects and discard cancelled results", async ({ page }) => {
  const fixture = await setup(page, { count: 250, slow: true });
  await page.emulateMedia({ reducedMotion: "reduce" }); await resolveCenter(page);
  for (let n = 0; n < 20; n++) {
    await expect(page.locator('[data-map-state="ready"]')).toBeVisible();
    await page.getByRole("button", { name: "搜索附近", exact: true }).click();
    await page.getByRole("radio", { name: n % 2 ? "2 km" : "1 km", exact: true }).check();
    await expect(page.getByText("本次已获取")).toContainText("0");
    await page.getByRole("button", { name: "最近搜索", exact: true }).click();
    await page.getByRole("button", { name: "探索附近", exact: true }).click();
    await resolveCenter(page);
  }
  await search(page); await expect(page.getByText("本次已获取")).toContainText("250");
  await page.getByRole("button", { name: "修改地点", exact: true }).click();
  await expect.poll(async () => (await harness(page)).liveMaps).toBe(0);
  const state = await harness(page); expect(state.created).toBe(state.destroyed); expect(state.listeners).toBe(0);
  expect(fixture.errors).toEqual([]);
});

for (const mobile of [false, true]) test(`50/250/500/1000 fixtures: CPU-throttled density and update measurements (${mobile ? "mobile" : "desktop"})`, async ({ page, context }, testInfo) => {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await setup(page, { count: 50 });
  const cdp = await context.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.evaluate(() => {
    const stats = window as unknown as { __mapMeasures: number[]; __mapFeedback: number[]; __mapLongTasks: number[] };
    stats.__mapMeasures = []; stats.__mapFeedback = []; stats.__mapLongTasks = [];
    new PerformanceObserver(list => { for (const entry of list.getEntries()) {
      if (entry.name === "nearby-map-update") stats.__mapMeasures.push(entry.duration);
      if (entry.name === "nearby-map-feedback") stats.__mapFeedback.push(entry.duration);
    } }).observe({ type: "measure" });
    new PerformanceObserver(list => { for (const entry of list.getEntries()) stats.__mapLongTasks.push(entry.duration); }).observe({ type: "longtask" });
  });
  await resolveCenter(page);
  if (mobile) await page.getByRole("button", { name: "地图", exact: true }).click();
  await expect(page.locator('[data-map-state="ready"]')).toBeVisible();
  const measurements = [];
  for (const count of [50, 250, ...Array<number>(20).fill(500), 1000]) {
    const before = (await harness(page)).updates;
    const beforeFeedback = await page.evaluate(() => (window as unknown as { __mapFeedback: number[] }).__mapFeedback.length);
    fixture.replace(count); await search(page);
    await expect(page.getByText("本次已获取")).toContainText(String(count));
    await expect.poll(async () => (await harness(page)).updates).toBeGreaterThan(before);
    await expect.poll(async () => (await harness(page)).submitted).toBeGreaterThanOrEqual(count / 3);
    const snapshot = await harness(page);
    expect(snapshot.groups.reduce((sum, group) => sum + group.length, 0)).toBe(snapshot.submitted);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __mapFeedback: number[] }).__mapFeedback.length)).toBeGreaterThan(beforeFeedback);
    const feedback = await page.evaluate(() => (window as unknown as { __mapFeedback: number[] }).__mapFeedback.at(-1));
    measurements.push({ count, feedback, ...snapshot });
  }
  const timings = await page.evaluate(() => {
    const stats = window as unknown as { __mapMeasures: number[]; __mapFeedback: number[]; __mapLongTasks: number[] };
    const values = [...stats.__mapMeasures].sort((a,b) => a-b);
    return { samples: values.length, updateP95: values[Math.ceil(values.length * .95) - 1], feedback: stats.__mapFeedback, longTasks: stats.__mapLongTasks };
  });
  const feedback500 = measurements.filter(item => item.count === 500).map(item => item.feedback!).sort((a,b) => a-b);
  const feedback500P95 = feedback500[Math.ceil(feedback500.length * .95) - 1];
  const report = JSON.stringify({ engine: "SDK contract fixture", mode: process.env.NEARBY_MAP_TEST_PRODUCTION === "1" ? "production" : "development", browserVersion: context.browser()?.version(), cpuSlowdown: 4, mobile, feedback500P95, measurements, timings }, null, 2);
  await testInfo.attach("map-performance.json", { body: report, contentType: "application/json" });
  await mkdir("harness/build/map-search-2026-11-08", { recursive: true });
  await writeFile(`harness/build/map-search-2026-11-08/performance-${mobile ? "mobile" : "desktop"}.json`, report);
  expect(timings.updateP95).toBeLessThanOrEqual(150);
  if (process.env.NEARBY_MAP_TEST_PRODUCTION === "1") expect(feedback500P95).toBeLessThanOrEqual(150);
  expect(fixture.errors).toEqual([]);
});
