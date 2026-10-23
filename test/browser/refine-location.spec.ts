import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import fs from "node:fs/promises";

const evidence = process.env.UX6_EVIDENCE_DIR ?? "harness/build/issue-10-evidence/ux6";
const refineButton = (page: Page) => page.getByRole("button", { name: /没找到想要的地点？试试补充/ });
const input = (page: Page) => page.getByLabel("地点", { exact: true });
const parse = (page: Page) => page.getByRole("button", { name: "解析地点", exact: true });
async function apiEvidence(request: APIRequestContext) { return (await request.get("/__test/evidence")).json(); }
async function noNearby(request: APIRequestContext) {
  expect((await apiEvidence(request)).requests.filter((r: { path: string }) => r.path === "/api/search")).toHaveLength(0);
}
test.beforeEach(async ({ request }) => { await request.post("/__test/reset"); });

for (const width of [1440, 390]) {
  test("UX6 repeated refinement, explicit selection and keyboard " + width, async ({ page, request }) => {
    await fs.mkdir(evidence, { recursive: true });
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await request.post("/__test/control", { data: { candidateCount: 7, candidateLabel: "首次候选" } });
    await page.goto("/explore");
    await expect(page.locator("#location-refine-help")).toHaveCount(0);
    await input(page).fill("全季酒店");
    await parse(page).click();
    await expect(page.locator(".candidate-button")).toHaveCount(5);
    await page.getByRole("button", { name: "查看更多地点" }).click();
    await expect(page.locator(".candidate-button")).toHaveCount(7);
    await page.screenshot({ path: evidence + "/candidates-" + width + ".png", animations: "disabled" });
    for (const [round, suffix] of [[1, " 上海静安"], [2, " 南京西路"]] as const) {
      await refineButton(page).focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(input(page)).toBeFocused();
      const previous = round === 1 ? "全季酒店" : "全季酒店 上海静安";
      await expect(input(page)).toHaveValue(previous);
      expect(await input(page).evaluate((node) => [(node as HTMLInputElement).selectionStart, (node as HTMLInputElement).selectionEnd])).toEqual([previous.length, previous.length]);
      await expect(input(page)).toHaveAttribute("aria-describedby", "location-refine-help");
      await expect(page.locator("#location-refine-help")).toBeVisible();
      await expect(page.getByRole("textbox")).toHaveCount(1);
      if (width === 390) expect((await page.locator("#location-refine-help").boundingBox())!.height).toBeGreaterThan(18);
      await page.screenshot({ path: evidence + "/helper-" + width + "-" + round + ".png", animations: "disabled" });
      await input(page).press("End");
      await input(page).pressSequentially(suffix);
      await expect(input(page)).toHaveValue(previous + suffix);
      await expect(page.locator("#location-refine-help")).toBeVisible();
      await request.post("/__test/control", { data: { candidateCount: 2, candidateLabel: "补充候选" + round, resolveDelayMs: 300 } });
      await parse(page).click();
      await expect(page.locator(".candidate-button")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "解析中…" })).toBeDisabled();
      await expect(page.locator(".candidate-button")).toHaveCount(2);
      await expect(page.locator(".candidate-button").first()).toContainText("补充候选" + round);
      await expect(page.locator("#location-refine-help")).toHaveCount(0);
      await noNearby(request);
    }
    const requests = (await apiEvidence(request)).requests.filter((r: { path: string }) => r.path === "/api/resolve-location");
    expect(requests.map((r: { body: { query: string } }) => r.body.query)).toEqual(["全季酒店", "全季酒店 上海静安", "全季酒店 上海静安 南京西路"]);
    await page.locator(".candidate-button").first().click();
    await expect(page.locator(".location-summary")).toContainText("补充候选2 1");
    await noNearby(request);
    await page.getByRole("button", { name: "搜索附近", exact: true }).click();
    await expect(page.locator(".place-row").first()).toBeVisible();
    const searches = (await apiEvidence(request)).requests.filter((r: { path: string }) => r.path === "/api/search");
    expect(searches).toHaveLength(1);
    expect(searches[0].body.center).toEqual({ longitude: 114.032, latitude: 22.609 });
    expect(searches[0].body.resolvedLocation.query).toBe("全季酒店 上海静安 南京西路");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("UX6 not-found entry, helper clear and empty-query validation", async ({ page, request }) => {
  await request.post("/__test/control", { data: { resolution: "empty" } });
  await page.goto("/explore");
  await input(page).fill("未命中名称");
  await parse(page).click();
  await expect(page.getByRole("region", { name: "地点解析候选" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /暂未找到匹配地点，试试补充/ }).click();
  await expect(input(page)).toBeFocused();
  await expect(input(page)).toHaveValue("未命中名称");
  await expect(page.locator("#location-refine-help")).toBeVisible();
  await page.getByRole("button", { name: "清空地点" }).click();
  await expect(input(page)).toHaveValue("");
  await expect(page.locator("#location-refine-help")).toHaveCount(0);
  await parse(page).click();
  await expect(page.getByText("请先输入地点名称")).toBeVisible();
  expect((await apiEvidence(request)).requests.filter((r: { path: string }) => r.path === "/api/resolve-location")).toHaveLength(1);
  await input(page).fill("未命中名称 上海");
  await request.post("/__test/control", { data: { resolution: "candidates" } });
  await parse(page).click();
  await expect(page.locator(".candidate-button")).toHaveCount(2);
  await noNearby(request);
});

test("UX6 fresh confirmed address requires a click and retains coordinates", async ({ page, request }) => {
  await request.post("/__test/control", { data: { resolution: "confirmed" } });
  await page.goto("/explore");
  await input(page).fill("深圳市龙华区某街道地址");
  await parse(page).click();
  await expect(page.locator(".candidate-button")).toHaveCount(1);
  await expect(page.getByRole("region", { name: "地点解析候选" })).toContainText("验收西广场地址");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("search-center-indicator")).toHaveCount(0);
  await noNearby(request);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "搜索附近", exact: true })).toBeDisabled();
  await expect(input(page)).toBeFocused();
  await parse(page).click();
  await page.locator(".candidate-button").click();
  await expect(page.getByTestId("search-center-indicator")).toHaveCount(1);
  await noNearby(request);
  await page.getByRole("button", { name: "搜索附近", exact: true }).click();
  await expect(page.locator(".place-row").first()).toBeVisible();
  const searches = (await apiEvidence(request)).requests.filter((r: { path: string }) => r.path === "/api/search");
  expect(searches[0].body.center).toEqual({ longitude: 114.025, latitude: 22.609 });
  expect(searches[0].body.resolvedLocation.formattedAddress).toBe("验收西广场地址");
});

test("UX6 out-of-order response cannot replace new candidates or edited input", async ({ page, request }) => {
  await page.goto("/explore");
  await request.post("/__test/control", { data: { candidateLabel: "旧候选", resolveDelayMs: 900 } });
  await input(page).fill("旧查询");
  const oldResponse = page.waitForResponse((response) => response.url().endsWith("/api/resolve-location") && response.request().postDataJSON().query === "旧查询");
  await parse(page).click();
  await input(page).fill("新查询 上海");
  await request.post("/__test/control", { data: { candidateLabel: "新候选", resolveDelayMs: 0 } });
  await parse(page).click();
  await expect(page.locator(".candidate-button").first()).toContainText("新候选");
  await oldResponse;
  await expect(page.locator(".candidate-button")).toHaveCount(2);
  await expect(page.locator(".candidate-button").first()).toContainText("新候选");
  await expect(page.getByText("旧候选 1", { exact: true })).toHaveCount(0);
  await refineButton(page).click();
  await request.post("/__test/control", { data: { candidateLabel: "过期候选", resolveDelayMs: 500 } });
  const staleResponse = page.waitForResponse((response) => response.url().endsWith("/api/resolve-location"));
  await parse(page).click();
  await input(page).fill("再次编辑而未提交");
  await staleResponse;
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(input(page)).toHaveValue("再次编辑而未提交");
  await expect(page.getByRole("region", { name: "地点解析候选" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "搜索附近", exact: true })).toBeDisabled();
  await noNearby(request);
});

test("UX6 history replay closes helper and directly reuses saved confirmed center", async ({ page, request }) => {
  await page.goto("/explore");
  await input(page).fill("深圳北站");
  await parse(page).click();
  await page.getByRole("button", { name: /深圳北站西广场/ }).click();
  await page.getByRole("button", { name: "搜索附近", exact: true }).click();
  await expect.poll(async () => (await apiEvidence(request)).records.length).toBe(1);
  await page.getByRole("button", { name: "修改地点" }).click();
  await input(page).fill("全季酒店");
  await parse(page).click();
  await refineButton(page).click();
  await expect(page.locator("#location-refine-help")).toBeVisible();
  await page.getByRole("button", { name: "历史记录", exact: true }).click();
  await page.getByRole("button", { name: /深圳北站西广场.*10 个类别/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "地点解析候选" })).toHaveCount(0);
  await expect(page.locator("#location-refine-help")).toHaveCount(0);
  await expect(page.locator(".location-summary")).toContainText("深圳北站西广场");
  await expect.poll(async () => (await apiEvidence(request)).requests.filter((r: { path: string }) => r.path === "/api/search").length).toBe(2);
  const data = await apiEvidence(request);
  expect(data.requests.filter((r: { path: string }) => r.path === "/api/resolve-location")).toHaveLength(2);
  expect(data.requests.filter((r: { path: string }) => r.path === "/api/search")[1].body.center).toEqual({ longitude: 114.025, latitude: 22.609 });
});
