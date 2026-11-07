import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

test("local login shares the release form and retains guest entry, identity cleanup and mobile access", async ({ page }) => {
  const { a } = JSON.parse(await readFile(".local/nearby-beta-e2e/accounts.json", "utf8"));
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto("/");
  await expect(page.getByRole("heading", { name: "登录 Nearby", exact: true })).toBeVisible();
  await expect(page.getByText("本机测试版", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "账户登录", exact: true }).getByRole("heading")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "注册", exact: true })).toHaveCount(0);
  await page.screenshot({ path: ".local/nearby-beta-e2e/login-local-desktop.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".local/nearby-beta-e2e/login-local-mobile.png", fullPage: true, animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel("邮箱", { exact: true }).fill(a.email); await page.getByLabel("密码", { exact: true }).fill(a.password);
  await page.getByRole("button", { name: "显示密码", exact: true }).click(); await expect(page.getByLabel("密码", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "隐藏密码", exact: true }).click(); await expect(page.getByLabel("密码", { exact: true })).toHaveAttribute("type", "password");
  const refreshed = page.waitForResponse(r => r.url().endsWith("/api/identity")); await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await refreshed;
  await expect(page.getByLabel("邮箱", { exact: true })).toHaveValue(a.email); await expect(page.getByLabel("密码", { exact: true })).toHaveValue(a.password);
  await page.setViewportSize({ width: 390, height: 480 }); await page.getByRole("button", { name: "登录", exact: true }).scrollIntoViewIfNeeded(); await expect(page.getByRole("button", { name: "登录", exact: true })).toBeInViewport();
  await page.getByRole("button", { name: "匿名体验", exact: true }).click(); await expect(page.getByRole("button", { name: "退出体验", exact: true })).toBeVisible();
  await page.evaluate(() => localStorage.setItem("nearby.guest.history.v1", "[]"));
  await page.getByRole("button", { name: "登录账户", exact: true }).click();
  await expect(page.getByLabel("密码", { exact: true })).toHaveValue("");
  await page.getByLabel("邮箱", { exact: true }).fill(a.email); await page.getByLabel("密码", { exact: true }).fill(a.password); await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("button", { name: "添加 Key", exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("nearby.guest.history.v1"))).toBeNull();
  await page.getByRole("button", { name: "退出登录", exact: true }).click(); await expect(page.getByRole("heading", { name: "登录 Nearby", exact: true })).toBeVisible(); await expect(page.getByLabel("密码", { exact: true })).toHaveValue("");
});
