import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

const evidence = "harness/build/issue-10-evidence";
test.beforeEach(async ({ request }) => { await request.post("/__test/reset"); });

for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "tablet", width: 820, height: 1180 }, { name: "mobile", width: 390, height: 844 }]) {
  test("B1 formal layout and actual API state " + viewport.name, async ({ page, request }) => {
    await fs.mkdir(evidence + "/b1", { recursive: true });
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await request.post("/__test/control", { data: { resultCount: 6 } });
    await page.goto("/explore");
    await page.getByLabel("地点", { exact: true }).fill("深圳北站");
    await page.getByRole("button", { name: "解析地点", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "确认地点" })).toBeVisible();
    await page.getByRole("button", { name: /深圳北站西广场/ }).click();
    await page.getByRole("button", { name: "附近生活服务", exact: true }).click();
    await page.getByRole("button", { name: "清空", exact: true }).click();
    await page.getByLabel("火锅", { exact: true }).check();
    await page.getByLabel("1 km", { exact: true }).check();
    await page.getByRole("dialog").getByRole("button", { name: "搜索附近", exact: true }).click();
    await expect(page.locator(".place-row")).toHaveCount(6);
    await expect(page.locator(".place-row").first()).toContainText("西广场最新结果 1 · 火锅");
    await expect(page.getByTestId("search-center-indicator")).toHaveCount(1);
    await expect(page.getByTestId("search-center-indicator")).toContainText("深圳北站西广场");
    await expect(page.getByTestId("search-range-indicator")).toHaveText("1 km");
    await expect(page.getByText("地图尚未接入", { exact: true })).toBeVisible();
    await expect(page.getByText("仅示意搜索条件，不表示地理位置或地图比例")).toBeVisible();
    await expect(page.locator(".workspace-map img, .proto-map, .proto-bookmark")).toHaveCount(0);
    const workspace = await page.locator(".workspace-body").boundingBox();
    const list = await page.locator(".workbench-results").boundingBox();
    const map = await page.locator(".workspace-map").boundingBox();
    if (viewport.width >= 768) {
      expect(list!.width / workspace!.width).toBeGreaterThan(.40);
      expect(list!.width / workspace!.width).toBeLessThan(.43);
      expect(map!.x).toBeGreaterThan(list!.x);
    } else expect(map!.y + map!.height).toBeCloseTo(list!.y, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
    await page.screenshot({ path: evidence + "/b1/explore-" + viewport.name + ".png", fullPage: true, animations: "disabled" });
    await fs.writeFile(evidence + "/b1/" + viewport.name + "-geometry.json", JSON.stringify({ viewport, workspace, list, map }, null, 2));
    const data = await (await request.get("/__test/evidence")).json();
    const searches = data.requests.filter((r: { path: string }) => r.path === "/api/search");
    expect(searches).toHaveLength(1);
    expect(searches[0].body.center).toEqual({ longitude: 114.025, latitude: 22.609 });
    expect(searches[0].body.radiusMeters).toBe(1000);
    expect(searches[0].body.categoryIds).toEqual(["hotpot"]);
    expect(errors).toEqual([]);
  });
}

test("B1 formal workspace breakpoint bounds and controls", async ({ page }) => {
  const geometry = [];
  for (const width of [768, 820, 1024, 1279, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/explore");
    await expect(page.getByRole("heading", { name: "探索附近" })).toBeAttached();
    const workspace = await page.locator(".workspace-body").boundingBox();
    const list = await page.locator(".workbench-results").boundingBox();
    const map = await page.locator(".workspace-map").boundingBox();
    expect(list!.width / workspace!.width).toBeGreaterThan(.40);
    expect(list!.width / workspace!.width).toBeLessThan(.43);
    expect(map!.width).toBeGreaterThan(list!.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
    for (const locator of [page.getByRole("button", { name: "解析地点", exact: true }), page.getByRole("button", { name: "搜索附近", exact: true }), page.getByLabel("搜索范围", { exact: true })]) {
      const box = await locator.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    await page.getByRole("button", { name: "附近生活服务", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "附近生活服务", exact: true })).toBeFocused();
    geometry.push({ width, workspace, list, map });
  }
  await fs.mkdir(evidence + "/b1", { recursive: true });
  await fs.writeFile(evidence + "/b1/breakpoints.json", JSON.stringify(geometry, null, 2));
});
