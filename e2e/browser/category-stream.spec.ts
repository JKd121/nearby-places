import { readFileSync } from "node:fs";
import { test, expect } from "../fixtures";

const install = readFileSync("test/category-browser-fixture.mjs", "utf8").replace("export function", "function") + "\ninstallCategoryBrowserFixture();";
test.beforeEach(async ({ page }) => {
  await page.addInitScript({ content: install });
  await page.goto("/");
  await page.getByRole("textbox", { name: "地点", exact: true }).fill("深圳北站");
  await page.getByRole("button", { name: "解析地点", exact: true }).click();
  await page.getByRole("button", { name: "搜索附近", exact: true }).click();
});

test("类别先后返回，展开与排序独立，并在后续进度中保留", async ({ page }) => {
  const headers = page.locator('button[aria-controls$="-body"]');
  await expect(headers).toHaveCount(10);
  await expect(page.locator('button[aria-controls$="-body"][aria-expanded="true"]')).toHaveCount(0);
  await page.evaluate("window.__categoryFixture.push('hotel')");
  const hotel = page.getByRole("region", { name: /^酒店/ });
  await hotel.getByRole("button", { name: /^酒店/ }).click();
  await expect(hotel.locator("ol li")).toHaveCount(10);
  await expect(page.getByRole("button", { name: /^商场.*搜索中/ })).toBeVisible();
  await page.evaluate("window.__categoryFixture.push('hotpot')");
  const hotpot = page.getByRole("region", { name: /^火锅/ });
  await hotpot.getByRole("button", { name: /^火锅/ }).click();
  await hotel.getByRole("combobox").selectOption("rating-desc");
  await expect(hotpot.getByRole("combobox")).toHaveValue("distance-asc");
  await page.evaluate("window.__categoryFixture.push('mall', 'success', 5)");
  await expect(hotel.getByRole("button", { name: /^酒店/ })).toHaveAttribute("aria-expanded", "true");
  await expect(hotpot.locator("ol li")).toHaveCount(10);
  await hotel.getByRole("button", { name: /^加载更多/ }).click();
  await expect(hotel.locator("ol li")).toHaveCount(20);
  await hotel.getByRole("button", { name: /^加载更多/ }).click();
  await expect(hotel.locator("ol li")).toHaveCount(25);
  await expect(hotel.getByRole("button", { name: "搜索结束后可获取更多" })).toBeDisabled();
  await page.evaluate("window.__categoryFixture.finish()");
  await expect.poll(() => page.evaluate("window.__categoryFixture.historySaves")).toBe(1);
  await page.evaluate("window.__categoryFixture.failPage = true");
  await hotel.getByRole("button", { name: "获取更多附近结果", exact: true }).click();
  await expect(hotel.getByText("模拟分页失败，请重试")).toBeVisible();
  await hotel.getByRole("button", { name: "重试加载" }).click();
  await expect(hotel.locator("ol li")).toHaveCount(35);
  await expect(hotel.getByRole("button", { name: /^酒店/ })).toContainText("50 个地点");
  await expect(hotpot.locator("ol li")).toHaveCount(10);
  await expect(hotel.getByRole("combobox")).toHaveValue("rating-desc");
});

test("断流保留已返回地点，新输入取消旧流并忽略迟到结果", async ({ page }) => {
  await page.evaluate("window.__categoryFixture.push('hotel', 'success', 5)");
  const hotel = page.getByRole("region", { name: /^酒店/ });
  await hotel.getByRole("button", { name: /^酒店/ }).click();
  await page.evaluate("window.__categoryFixture.breakStream()");
  await expect(page.getByText("搜索连接已中断，已返回的地点仍可查看，请重新搜索。")).toBeVisible();
  await expect(hotel.locator("ol li")).toHaveCount(5);
  expect(await page.evaluate("window.__categoryFixture.historySaves")).toBe(0);
  await page.getByRole("button", { name: "重新搜索", exact: true }).click();
  await expect(page.locator('button[aria-controls$="-body"][aria-expanded="true"]')).toHaveCount(0);
  await page.evaluate("window.savedFinish = window.__categoryFixture.finish");
  await page.getByRole("textbox", { name: "地点", exact: true }).fill("新地点");
  await page.evaluate("window.savedFinish()");
  await expect(headers(page)).toHaveCount(0);
  await expect(page.getByText("从一个地点开始", { exact: true })).toBeVisible();
  expect(await page.evaluate("window.__categoryFixture.cancelled")).toBe(1);
});

function headers(page: import("@playwright/test").Page) { return page.locator('button[aria-controls$="-body"]'); }

test("390px手机可用键盘展开，空结果与失败分别展示", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate("window.__categoryFixture.finish()");
  const bakery = page.getByRole("region", { name: /^面包/ });
  await bakery.getByRole("button", { name: /^面包/ }).focus();
  await page.keyboard.press("Enter");
  await expect(bakery.getByText("当前类别没有结果", { exact: true })).toBeVisible();
  const dessert = page.getByRole("region", { name: /^甜品/ });
  await dessert.getByRole("button", { name: /^甜品/ }).click();
  await expect(dessert.getByText("该类别暂时无法搜索，请稍后再试")).toBeVisible();
  await expect(bakery.getByRole("button", { name: /^面包/ })).toHaveAttribute("aria-expanded", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
