import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";

const evidenceDirectory = process.env.BROWSER_EVIDENCE_DIR ?? "harness/build/issue-7-evidence/after";
async function capture(page: Page, name: string) {
  await fs.mkdir(evidenceDirectory, { recursive: true });
  await page.screenshot({ path: evidenceDirectory + "/" + name + ".png", animations: "disabled" });
}

test.beforeEach(async ({ request }) => { await request.post("/__test/reset"); });

async function bounded(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}
async function chooseLocation(page: Page) {
  await page.goto("/explore");
  await page.getByLabel("地点", { exact: true }).fill("深圳北站");
  await page.getByRole("button", { name: "解析地点", exact: true }).click();
  await page.getByRole("button", { name: /深圳北站西广场/ }).click();
}
async function setConditions(page: Page, categories = ["火锅"]) {
  await page.getByRole("button", { name: "附近生活服务", exact: true }).click();
  await page.getByRole("button", { name: "清空", exact: true }).click();
  for (const category of categories) await page.getByLabel(category, { exact: true }).check();
  await page.getByLabel("1 km", { exact: true }).check();
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
  test("bounded candidates, persistent conditions and focus " + viewport.width, async ({ page, request }) => {
    await page.setViewportSize(viewport);
    await request.post("/__test/control", { data: { candidateCount: 14, longNames: true } });
    await page.goto("/explore");
    await bounded(page);
    await page.getByLabel("地点", { exact: true }).fill("深圳北站");
    await page.getByRole("button", { name: "解析地点", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "确认地点" });
    await expect(dialog).toBeVisible();
    await capture(page, "explore-" + viewport.width + "-candidates");
    await page.getByRole("button", { name: "查看更多地点" }).click();
    await expect(page.locator(".candidate-button")).toHaveCount(14);
    const geometry = await dialog.boundingBox();
    expect(geometry!.height).toBeLessThan(viewport.height);
    await expect(page.locator(".explore-dialog-body")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("地点", { exact: true })).toBeFocused();
    await page.getByRole("button", { name: "解析地点", exact: true }).click();
    await page.getByRole("button", { name: /深圳北站西广场/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "附近生活服务", exact: true })).toBeFocused();
    await setConditions(page);
    await page.getByRole("button", { name: "收起条件" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "附近生活服务", exact: true })).toContainText("火锅");
    await expect(page.getByRole("button", { name: "附近生活服务", exact: true })).toContainText("1 km");
    await page.getByRole("button", { name: "附近生活服务", exact: true }).click();
    await expect(page.getByLabel("火锅", { exact: true })).toBeChecked();
    await expect(page.getByLabel("1 km", { exact: true })).toBeChecked();
    await expect(page.getByLabel("酒店", { exact: true })).not.toBeChecked();
    await capture(page, "explore-" + viewport.width + "-conditions");
    await page.getByRole("dialog").getByRole("button", { name: "搜索附近", exact: true }).click();
    await expect(page.getByRole("heading", { name: "附近结果", exact: true })).toBeFocused();
    await expect(page.locator(".place-row")).toHaveCount(1);
    await bounded(page);
    if (viewport.width === 390) {
      await expect(page.getByRole("button", { name: "收起结果" })).toBeVisible();
      const panel = await page.locator(".workbench-results").boundingBox();
      const map = await page.locator(".workspace-map").boundingBox();
      expect(panel!.y).toBeGreaterThan(map!.y + 100);
      await page.getByRole("button", { name: "收起结果" }).click();
      await expect(page.locator(".place-row")).not.toBeVisible();
      await capture(page, "explore-mobile-results-collapsed");
      await page.getByRole("button", { name: "展开结果" }).click();
      await expect(page.locator(".place-row")).toBeVisible();
      await bounded(page);
    }
    await page.getByRole("button", { name: "修改地点" }).click();
    await expect(page.getByLabel("地点", { exact: true })).toBeFocused();
    await expect(page.getByLabel("地点", { exact: true })).toHaveValue("深圳北站");
    await bounded(page);
  });
}

test("resolver loading, not found, failure, direct confirmation and stale response", async ({ page, request }) => {
  await page.goto("/explore");
  await request.post("/__test/control", { data: { resolution: "empty", resolveDelayMs: 600 } });
  await page.getByLabel("地点", { exact: true }).fill("未知地点");
  await page.getByRole("button", { name: "解析地点", exact: true }).click();
  await expect(page.getByText("正在查找地点…")).toBeVisible();
  // Category/radius changes must not invalidate an in-flight resolver and leave
  // it stuck in resolving. The editing entry is unavailable until it settles.
  await expect(page.getByRole("button", { name: "附近生活服务", exact: true })).toBeDisabled();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/没有找到明确地点/)).toBeVisible();
  await expect(page.getByRole("dialog", { name: "确认地点" })).toBeVisible();
  await page.getByRole("button", { name: /暂未找到匹配地点，试试补充/ }).click();
  await expect(page.getByRole("button", { name: "附近生活服务", exact: true })).toBeEnabled();
  await setConditions(page);
  await page.getByRole("button", { name: "收起条件" }).click();
  await expect(page.getByRole("button", { name: "解析地点", exact: true })).toBeEnabled();
  await bounded(page);
  await request.post("/__test/control", { data: { resolution: "error", resolveDelayMs: 0 } });
  await page.getByRole("button", { name: "解析地点", exact: true }).click();
  await expect(page.locator(".workspace-feedback [role=alert]")).toContainText("地点解析暂时失败");
  await request.post("/__test/control", { data: { resolution: "candidates", resolveDelayMs: 800 } });
  await page.getByRole("button", { name: "解析地点", exact: true }).click();
  await page.getByLabel("地点", { exact: true }).fill("另一个地点");
  await page.waitForTimeout(950); // Wait past the deliberately stale fixture response.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await request.post("/__test/control", { data: { resolution: "confirmed", resolveDelayMs: 0 } });
  await page.getByRole("button", { name: "解析地点", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "确认地点" })).toBeVisible();
  await expect(page.locator(".location-summary")).not.toContainText("深圳北站西广场");
  await page.getByRole("button", { name: /深圳北站西广场/ }).click();
  await expect(page.locator(".location-summary")).toContainText("深圳北站西广场");
});

test("filters, all sort modes, local reveal, page 2 failure/retry and AMap links", async ({ page, request }) => {
  await request.post("/__test/control", { data: { resultCount: 25 } });
  await chooseLocation(page);
  await setConditions(page);
  await page.getByRole("dialog").getByRole("button", { name: "搜索附近", exact: true }).click();
  await expect(page.locator(".place-row")).toHaveCount(20);
  await page.getByRole("button", { name: /加载更多/ }).click();
  await expect(page.locator(".place-row")).toHaveCount(25);
  await page.getByRole("tab", { name: "火锅", exact: true }).click();
  await expect(page.locator(".place-row")).toHaveCount(10);
  await page.getByLabel("排序", { exact: true }).selectOption("cost-asc");
  await expect(page.locator(".place-row").first()).toContainText("火锅 25");
  await page.getByLabel("排序", { exact: true }).selectOption("cost-desc");
  await expect(page.locator(".place-row").first().locator("h4")).toHaveText("西广场最新结果 1 · 火锅");
  await page.getByLabel("排序", { exact: true }).selectOption("rating-desc");
  await expect(page.locator(".place-row").first()).toContainText("火锅 5");
  await page.getByLabel("排序", { exact: true }).selectOption("distance-asc");
  await expect(page.locator(".place-row").first()).toContainText("100 m");
  await page.getByRole("button", { name: /加载更多/ }).click();
  await page.getByRole("button", { name: /加载更多/ }).click();
  await expect(page.locator(".place-row")).toHaveCount(25);
  await request.post("/__test/control", { data: { failPage: true } });
  await page.getByRole("button", { name: "获取更多附近结果" }).click();
  await expect(page.getByText("验收：第二页暂时失败")).toBeVisible();
  await request.post("/__test/control", { data: { failPage: false } });
  await page.getByRole("button", { name: "获取更多附近结果" }).click();
  await expect(page.locator(".place-row")).toHaveCount(28);
  await expect(page.getByText("已显示全部 28 个结果。")).toBeVisible();
  const link = page.locator(".place-location-link").first();
  await expect(link).toHaveAttribute("href", /^https:\/\/uri\.amap\.com\//);
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await bounded(page);
  const evidence = await (await request.get("/__test/evidence")).json();
  expect(evidence.requests.filter((r: { path: string }) => r.path === "/api/search/page")).toHaveLength(2);
});

test("search loading, partial failure, empty, all failed and transport retry", async ({ page, request }) => {
  await chooseLocation(page);
  await setConditions(page, ["火锅", "酒店"]);
  await request.post("/__test/control", { data: { failCategory: "hotel", slowLongitude: 114.025 } });
  await page.getByRole("dialog").getByRole("button", { name: "搜索附近", exact: true }).click();
  await expect(page.getByRole("heading", { name: "正在搜索附近…" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "附近结果", exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".workbench-results-heading")).toContainText("1 类失败");
  await page.getByRole("tab", { name: "酒店 · 失败" }).click();
  await expect(page.locator(".results [role=alert]")).toBeVisible();
  await request.post("/__test/control", { data: { resultCount: 0, failCategory: null, slowLongitude: null } });
  await page.getByRole("button", { name: "搜索附近", exact: true }).click();
  await page.getByRole("tab", { name: "火锅 · 空" }).click();
  await expect(page.locator(".results > .muted")).toBeVisible();
  await request.post("/__test/control", { data: { failCategory: "all" } });
  await page.getByRole("button", { name: "搜索附近", exact: true }).click();
  await expect(page.locator(".workbench-results-heading")).toContainText("0 类成功 · 2 类失败");
  await page.getByRole("tab", { name: "火锅 · 失败" }).click();
  await expect(page.locator(".results [role=alert]")).toBeVisible();
  await request.post("/__test/control", { data: { failCategory: null, resultCount: 1, failNextSearch: true } });
  await page.getByRole("button", { name: "搜索附近", exact: true }).click();
  await expect(page.locator(".workspace-empty[role=alert]")).toContainText("周边搜索暂时失败");
  await page.getByRole("button", { name: "重试搜索" }).click();
  await expect(page.locator(".place-row")).toHaveCount(2);
});

test("stale nearby search cannot replace a new center", async ({ page, request }) => {
  await chooseLocation(page);
  await request.post("/__test/control", { data: { slowLongitude: 114.025 } });
  await page.getByRole("button", { name: "搜索附近", exact: true }).click();
  await page.getByRole("button", { name: "修改地点" }).click();
  await page.getByRole("button", { name: "解析地点", exact: true }).click();
  await page.getByRole("button", { name: /深圳北站东广场/ }).click();
  await page.getByRole("button", { name: "搜索附近", exact: true }).click();
  await expect(page.locator(".place-row").first()).toContainText("东广场最新结果");
  await page.waitForTimeout(4200);
  await expect(page.locator(".location-summary")).toContainText("深圳北站东广场");
  await expect(page.locator(".place-row").first()).toContainText("东广场最新结果");
  const evidence = await (await request.get("/__test/evidence")).json();
  expect(evidence.records).toHaveLength(1);
  expect(evidence.records[0].confirmedLocation.name).toBe("深圳北站东广场");
});
