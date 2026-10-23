import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const evidence = "harness/build/issue-8-stage-a-responsive-evidence";
for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "tablet", width: 820, height: 1180 }, { name: "mobile", width: 390, height: 844 }]) {
  test("prototype Stage A: " + viewport.name, async ({ page, request }) => {
    await page.setViewportSize(viewport);
    await fs.mkdir(evidence, { recursive: true });
    await request.post("/__test/reset");
    const errors: string[] = [];
    const api: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (req) => { if (new URL(req.url()).pathname.startsWith("/api/")) api.push(req.url()); });
    if (viewport.name === "desktop") {
      await page.goto(pathToFileURL(resolve("docs/design/nearby-explore-v2-reference.svg")).href);
      await page.screenshot({ path: evidence + "/reference-desktop.png", animations: "disabled" });
    }
    await page.goto("/prototype/explore");
    await expect(page.getByRole("heading", { name: "探索地点", exact: true })).toBeVisible();
    await expect(page.getByText("视觉原型 · 演示数据", { exact: true })).toBeVisible();
    await expect(page.getByText("6 个演示地点", { exact: false })).toBeVisible();
    await expect(page.getByTestId("prototype-center-marker")).toHaveCount(1);
    await expect(page.getByTestId("prototype-range-circle")).toHaveCount(1);
    await expect(page.locator(".proto-map img")).toBeVisible();
    expect(await page.locator(".proto-map img").evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBe(780);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
    const geometry = await page.locator(".proto-workspace").boundingBox();
    const map = await page.locator(".proto-map").boundingBox();
    const list = await page.locator(".proto-results").boundingBox();
    if (viewport.name === "desktop") {
      expect(geometry).toMatchObject({ x: 220, y: 250, width: 1220, height: 650 });
      expect(map).toMatchObject({ x: 720, y: 250, width: 720, height: 650 });
      expect(list!.width).toBe(500);
    } else if (viewport.name === "tablet") {
      expect(map!.width).toBeGreaterThan(list!.width);
      expect(list!.width).toBeCloseTo(306.68, 1);
    } else {
      expect(map!.y).toBeLessThan(list!.y);
      expect(map!.height).toBeGreaterThan(list!.height);
    }
    await page.screenshot({ path: evidence + "/" + viewport.name + ".png", fullPage: true, animations: "disabled" });
    if (viewport.name === "desktop") await page.screenshot({ path: evidence + "/after-top.png", clip: { x: 0, y: 0, width: 1440, height: 250 }, animations: "disabled" });
    await fs.writeFile(evidence + "/" + viewport.name + "-geometry.json", JSON.stringify({ viewport, workspace: geometry, map, list }, null, 2) + "\n");
    const originalRange = await page.getByTestId("prototype-range-circle").boundingBox();
    await page.getByLabel("原型搜索范围", { exact: true }).selectOption("1");
    await expect(page.locator(".proto-range-label")).toHaveText("1 km");
    const smallerRange = await page.getByTestId("prototype-range-circle").boundingBox();
    expect(smallerRange!.width).toBeCloseTo(originalRange!.width / 3, 0);
    await page.getByRole("button", { name: "更多类别", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "选择演示类别" })).toBeVisible();
    await expect(page.getByRole("checkbox")).toHaveCount(10);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "更多类别", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "收藏演示：北城火锅（不保存）" }).click();
    await expect(page.getByRole("button", { name: "收藏演示：北城火锅（不保存）" })).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("button", { name: "选中演示地点：巷里老火锅" }).click();
    await expect(page.getByTestId("prototype-center-marker")).toHaveCount(1);
    await expect(page.getByTestId("prototype-center-marker")).toContainText("深圳北站西广场");
    await page.getByRole("button", { name: "搜索附近", exact: true }).click();
    await expect(page.locator(".proto-place")).toHaveCount(2);
    await expect(page.getByRole("heading", { name: "附近地点", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "修改地点", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "地点名称" })).toBeFocused();
    await expect(page.getByTestId("prototype-center-marker")).toHaveCount(0);
    await page.getByRole("button", { name: "解析地点", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "选择演示地点" })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: /深圳北站西广场.*深圳市/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("prototype-center-marker")).toHaveCount(1);
    if (viewport.name === "mobile") {
      await page.getByRole("button", { name: "收起", exact: true }).click();
      await expect(page.locator(".proto-results")).toHaveAttribute("data-expanded", "false");
      await page.getByRole("button", { name: "展开", exact: true }).click();
      await page.getByRole("button", { name: "打开原型导航" }).click();
      await expect(page.getByRole("dialog", { name: "Nearby 原型" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "打开原型导航" })).toBeFocused();
    }
    await page.reload();
    await expect(page.locator(".proto-place")).toHaveCount(6);
    await expect(page.getByRole("button", { name: "收藏演示：北城火锅（不保存）" })).toHaveAttribute("aria-pressed", "true");
    expect(api).toEqual([]);
    expect(errors).toEqual([]);
    const server = await (await request.get("/__test/evidence")).json();
    expect(server.requests).toEqual([]);
  });
}
test("prototype Stage A: breakpoint bounds", async ({ page }) => {
  const measurements = [];
  let previousListWidth = 0;
  await fs.mkdir(evidence, { recursive: true });
  for (const viewport of [{ width: 767, height: 844 }, ...[768, 820, 1024, 1180, 1279, 1280, 1440].map((width) => ({ width, height: width === 820 ? 1180 : 900 }))]) {
    await page.setViewportSize(viewport);
    await page.goto("/prototype/explore");
    await expect(page.getByRole("heading", { name: "探索地点", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
    const map = await page.locator(".proto-map").boundingBox();
    const list = await page.locator(".proto-results").boundingBox();
    const workspace = await page.locator(".proto-workspace").boundingBox();
    const sidebar = await page.locator(".proto-sidebar").boundingBox();
    if (viewport.width < 768) {
      expect(map!.y).toBeLessThan(list!.y);
      expect(map!.width).toBe(viewport.width);
    } else {
      expect(list!.width).toBeGreaterThanOrEqual(300);
      expect(list!.width).toBeLessThanOrEqual(500);
      if (viewport.width > 768) expect(list!.width / workspace!.width).toBeCloseTo(.41, 2);
      else expect(list!.width).toBe(300);
      expect(sidebar!.width).toBe(viewport.width < 1280 ? 72 : 220);
      expect(list!.width + map!.width).toBeCloseTo(workspace!.width, 1);
      expect(map!.width).toBeGreaterThan(list!.width);
      if (viewport.width > 768 && viewport.width < 1280) expect(list!.width).toBeGreaterThan(previousListWidth);
      previousListWidth = list!.width;
    }
    for (const control of [page.getByRole("button", { name: "搜索附近", exact: true }), page.getByLabel("原型搜索范围", { exact: true })]) {
      const box = await control.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    }
    await expect(page.getByTestId("prototype-center-marker")).toHaveCount(1);
    await expect(page.getByTestId("prototype-range-circle")).toHaveCount(1);
    if (viewport.width >= 768) {
      await page.screenshot({ path: evidence + "/viewport-" + viewport.width + ".png", fullPage: true, animations: "disabled" });
      await page.screenshot({ path: evidence + "/top-" + viewport.width + ".png", clip: { x: 0, y: 0, width: viewport.width, height: 250 }, animations: "disabled" });
    }
    measurements.push({ viewport, workspace, sidebar, map, list, listRatio: list!.width / workspace!.width, overflow: await page.evaluate(() => ({ horizontal: document.documentElement.scrollWidth > innerWidth, vertical: document.documentElement.scrollHeight > innerHeight + 1 })) });
  }
  await fs.writeFile(evidence + "/breakpoints.json", JSON.stringify(measurements, null, 2) + "\n");
});
