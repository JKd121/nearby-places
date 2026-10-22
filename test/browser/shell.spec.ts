import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";

const evidenceDirectory = "harness/build/issue-4-evidence";
const routes = [
  { path: "/", name: "home", heading: "下一处好地方，从这里发现。", navigation: "首页" },
  { path: "/explore", name: "explore", heading: "从一个地点，探索附近。", navigation: "探索地点" },
  { path: "/my-places", name: "my-places", heading: "给喜欢的地方，留个位置。", navigation: "我的地点" },
  { path: "/history", name: "history", heading: "接着上次，继续发现。", navigation: "搜索历史" },
];

test.beforeEach(async ({ request }) => { await request.post("/__test/reset"); });

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function capture(page: Page, name: string) {
  // Form interactions scroll controls into view. Start full-page evidence at the
  // document top so sticky navigation is not captured halfway down the canvas.
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await page.screenshot({ path: `${evidenceDirectory}/${name}.png`, fullPage: true, animations: "disabled" });
}

async function search(page: Page) {
  await page.goto("/explore");
  await page.getByLabel("地点", { exact: true }).fill("深圳北站");
  await page.getByRole("button", { name: "解析地点", exact: true }).click();
  await page.getByRole("button", { name: /深圳北站西广场/ }).click();
  await page.getByRole("button", { name: "清空", exact: true }).click();
  await page.locator(".checkbox-option").filter({ hasText: /^火锅$/ }).click();
  await page.locator(".option-pill").filter({ hasText: /^1 km$/ }).click();
  await page.getByRole("button", { name: "搜索附近", exact: true }).click();
  await expect(page.getByText("西广场最新结果 1 · 火锅", { exact: true })).toBeVisible();
  await expect.poll(async () => (await (await page.request.get("/__test/evidence")).json()).records.length).toBe(1);
}

for (const viewport of [{ width: 1440, height: 900, label: "desktop" }, { width: 390, height: 844, label: "mobile" }, { width: 820, height: 1180, label: "tablet" }]) {
  test(`four routes, refresh and responsive navigation: ${viewport.label}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(viewport);
    await fs.mkdir(evidenceDirectory, { recursive: true });
    for (const route of routes) {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(route.heading);
      if (route.name === "home" || route.name === "history") await expect(page.getByRole("heading", { name: "探索，从第一次出发开始" })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(route.heading);
      if (route.name === "home" || route.name === "history") await expect(page.getByRole("heading", { name: "探索，从第一次出发开始" })).toBeVisible();
      await noOverflow(page);
      await capture(page, `${route.name}-${viewport.label}-empty`);
      if (viewport.label === "mobile") {
        await page.getByRole("button", { name: "打开导航菜单" }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await expect(page.getByRole("dialog").locator('a[aria-current="page"]')).toContainText(route.navigation);
        await page.getByRole("dialog").getByRole("link", { name: /探索地点/ }).click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(page).toHaveURL(/\/explore$/);
      } else {
        await expect(page.locator('#desktop-sidebar a[aria-current="page"]')).toContainText(route.navigation);
      }
    }
    if (viewport.label !== "mobile") {
      await page.getByRole("button", { name: "收起侧边栏" }).click();
      await expect(page.locator(".app-shell")).toHaveAttribute("data-sidebar-state", "collapsed");
      await page.getByRole("button", { name: "展开侧边栏" }).click();
      await expect(page.locator(".app-shell")).toHaveAttribute("data-sidebar-state", "expanded");
    }
    expect(errors).toEqual([]);
  });
}

for (const mobile of [false, true]) {
  test(`search, save, route replay, refresh and delete: ${mobile ? "mobile" : "desktop"}`, async ({ page, request }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    await search(page);
    const label = mobile ? "mobile" : "desktop";
    await noOverflow(page);
    await capture(page, `explore-${label}-fixture-results`);
    await page.getByRole("button", { name: "历史记录", exact: true }).click();
    await expect(page.getByRole("button", { name: /深圳北站西广场.*1 个类别/ })).toBeVisible();
    await page.getByRole("button", { name: /深圳北站西广场.*1 个类别/ }).click();
    await expect(page.getByText("西广场最新结果 1 · 火锅", { exact: true })).toBeVisible();
    await page.goto("/");
    await expect(page.getByRole("link", { name: "继续探索：深圳北站西广场", exact: true })).toBeVisible();
    await capture(page, `home-${label}-fixture-history`);
    await request.post("/__test/control", { data: { version: 2 } });
    await page.getByRole("link", { name: "继续探索：深圳北站西广场", exact: true }).click();
    await expect(page.getByText("西广场最新结果 2 · 火锅", { exact: true })).toBeVisible();
    await expect(page.getByLabel("1 km", { exact: true })).toBeChecked();
    await expect(page.getByLabel("火锅", { exact: true })).toBeChecked();
    await expect(page.getByLabel("酒店", { exact: true })).not.toBeChecked();
    await page.goto("/history");
    await expect(page.getByRole("link", { name: "继续探索：深圳北站西广场", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("link", { name: "继续探索：深圳北站西广场", exact: true })).toBeVisible();
    await capture(page, `history-${label}-fixture-records`);
    const evidence = await (await request.get("/__test/evidence")).json();
    const searches = evidence.requests.filter((r: { path: string }) => r.path === "/api/search");
    expect(searches.length).toBeGreaterThanOrEqual(3);
    for (const entry of searches) {
      expect(entry.body.center).toEqual({ longitude: 114.025, latitude: 22.609 });
      expect(entry.body.categoryIds).toEqual(["hotpot"]);
      expect(entry.body.radiusMeters).toBe(1000);
    }
    expect(evidence.requests.filter((r: { path: string }) => r.path === "/api/resolve-location")).toHaveLength(1);
    await page.getByRole("button", { name: "删除搜索历史：深圳北站西广场" }).click();
    await expect(page.getByRole("heading", { name: "探索，从第一次出发开始" })).toBeVisible();
    await expect.poll(async () => (await (await request.get("/__test/evidence")).json()).records.length).toBe(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: "探索，从第一次出发开始" })).toBeVisible();
  });
}

test("history error/retry, loading and invalid replay are honest", async ({ page, request }) => {
  await request.post("/__test/control", { data: { failHistoryRead: true } });
  await page.goto("/history");
  await expect(page.locator(".feedback-banner[role=alert]")).toContainText("读取历史记录失败");
  await expect(page.getByText("探索，从第一次出发开始")).toHaveCount(0);
  await request.post("/__test/control", { data: { failHistoryRead: false, historyDelayMs: 700 } });
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("正在读取最近探索");
  await expect(page.getByText("探索，从第一次出发开始")).toBeVisible();
  await page.goto("/explore?history=missing-record");
  await expect(page.locator(".replay-message[role=alert]")).toContainText("这条历史已不在当前浏览器");
  const evidence = await (await request.get("/__test/evidence")).json();
  expect(evidence.requests.filter((r: { path: string }) => r.path === "/api/search")).toHaveLength(0);
});

test("mobile keyboard navigation closes with Escape and returns focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "打开导航菜单" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "打开导航菜单" })).toBeFocused();
});
