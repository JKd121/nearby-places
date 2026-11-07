import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";

type Account = { userId: string; email: string; password: string };
async function accounts(): Promise<{ a: Account; b: Account }> { return JSON.parse(await readFile(".local/nearby-beta-e2e/accounts.json", "utf8")); }
function testPool() {
  const url = process.env.NEARBY_IDENTITY_TEST_DATABASE_URL!;
  const target = new URL(url);
  if (target.hostname !== "127.0.0.1" || !target.pathname.startsWith("/nearby_identity_test")) throw new Error("Refusing non-test database");
  return new Pool({ connectionString: url });
}
test.beforeEach(async () => { const pool = testPool(); try { await pool.query(`DELETE FROM "RequestCounter" WHERE key LIKE 'auth:%'`); } finally { await pool.end(); } });
async function login(page: Page, account: Account) {
  await page.goto("/"); await page.getByLabel("邮箱", { exact: true }).fill(account.email); await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "登录", exact: true }).click(); await expect(page.getByText(account.email, { exact: true })).toBeVisible();
}
test("private beta has a responsive login, no public registration/guest, and supports Key setup and search", async ({ page }) => {
  const { a } = await accounts();
  await page.goto("/"); await expect(page.getByRole("heading", { name: "登录 Nearby" })).toBeVisible();
  await expect(page.getByRole("region", { name: "账户登录", exact: true }).getByRole("heading")).toHaveCount(0);
  await expect(page.getByText("本机测试版", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "注册", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "匿名体验", exact: true })).toHaveCount(0);
  await page.screenshot({ path: ".local/nearby-beta-e2e/login-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: ".local/nearby-beta-e2e/login-mobile.png", fullPage: true });
  for (const path of ["/api/auth/sign-up/email", "/api/auth/request-password-reset"]) expect((await page.request.post(path, { headers: { origin: "http://localhost:3127" }, data: { email: a.email, password: a.password, name: "Test" } })).status()).toBe(403);
  expect((await page.request.post("/api/guest/session", { headers: { origin: "http://localhost:3127" } })).status()).toBe(401);
  await page.getByLabel("邮箱", { exact: true }).fill(a.email); await page.getByLabel("密码", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "登录", exact: true }).click(); await expect(page.getByText("邮箱或密码有误", { exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await expect(page.getByLabel("密码", { exact: true })).toHaveValue("wrong-password");
  await page.getByLabel("密码", { exact: true }).fill(a.password); await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByText(a.email, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "添加 Key", exact: true }).click();
  await page.getByLabel("新的高德 Key").first().fill("a".repeat(32)); await page.getByRole("button", { name: "保存 Key", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "探索附近", exact: true }).click();
  await page.getByLabel("地点", { exact: true }).fill("深圳北站"); await page.getByRole("button", { name: "解析地点", exact: true }).click();
  await page.getByRole("button", { name: /^选用此地点/ }).click(); await page.getByRole("button", { name: "搜索附近", exact: true }).click();
  await expect(page.getByText(/已返回 10 \/ 10 类/)).toBeVisible();
  await page.reload(); await expect(page.getByText(a.email, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "最近搜索", exact: true }).click(); await expect(page.getByText("测试地点", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "退出登录", exact: true }).click(); await expect(page.getByRole("heading", { name: "登录 Nearby" })).toBeVisible();
});
test("private beta account switching clears drafts and temporary identity failure can retry", async ({ page, context }) => {
  const { a, b } = await accounts();
  await login(page, a); await page.getByRole("button", { name: "高德 Key 设置", exact: true }).click();
  await page.getByRole("button", { name: "更换 Key", exact: true }).click();
  await page.getByLabel("新的高德 Key").first().fill("c".repeat(32));
  await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await expect(page.getByLabel("新的高德 Key").first()).toHaveValue("c".repeat(32));
  const other = await context.newPage(); await other.goto("/"); await expect(other.getByText(a.email, { exact: true })).toBeVisible();
  await other.getByRole("button", { name: "退出登录", exact: true }).click(); await login(other, b);
  await expect(page.getByText(b.email, { exact: true })).toBeVisible(); await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "添加 Key", exact: true }).click();
  await expect(page.getByLabel("新的高德 Key")).toHaveValue("");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.route("**/api/identity", route => route.fulfill({ status: 503, json: { error: { message: "测试身份服务暂不可用" } } }));
  await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await expect(page.getByText("测试身份服务暂不可用", { exact: true })).toBeVisible();
  await expect(page.getByText(b.email, { exact: true })).toBeVisible();
  await page.unroute("**/api/identity"); await page.getByRole("button", { name: "重新读取身份" }).click(); await expect(page.getByText("测试身份服务暂不可用", { exact: true })).toHaveCount(0);
});
test("disabled account loses its browser session and cannot sign in again", async ({ page }) => {
  const { b } = await accounts(); await login(page, b);
  const url = process.env.NEARBY_IDENTITY_TEST_DATABASE_URL!;
  const target = new URL(url); if (target.hostname !== "127.0.0.1" || !target.pathname.startsWith("/nearby_identity_test")) throw new Error("Refusing non-test database");
  const pool = new Pool({ connectionString: url });
  try { await pool.query('UPDATE "User" SET "disabledAt"=now() WHERE id=$1', [b.userId]); await pool.query('DELETE FROM "Session" WHERE "userId"=$1', [b.userId]); } finally { await pool.end(); }
  await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await expect(page.getByRole("heading", { name: "登录 Nearby" })).toBeVisible();
  await page.getByLabel("邮箱", { exact: true }).fill(b.email); await page.getByLabel("密码", { exact: true }).fill(b.password); await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("heading", { name: "登录 Nearby" })).toBeVisible(); await expect(page.getByRole("button", { name: "退出登录", exact: true })).toHaveCount(0);
});
test("login errors remain generic and real throttling counts down, survives focus and recovers", async ({ page }) => {
  const { a } = await accounts(); await page.goto("/");
  let attempts = 0; page.on("request", request => { if (request.url().endsWith("/api/auth/sign-in/email")) attempts++; });
  for (const email of ["unknown-e2e@example.test", a.email, "both-wrong-e2e@example.test"]) {
    await page.getByLabel("邮箱", { exact: true }).fill(email); await page.getByLabel("密码", { exact: true }).fill("WrongPassword!");
    const response = page.waitForResponse(r => r.url().endsWith("/api/auth/sign-in/email"));
    await page.getByRole("button", { name: "登录", exact: true }).click(); expect((await response).status()).toBe(401);
    await expect(page.getByText("邮箱或密码有误", { exact: true })).toBeVisible();
  }
  await page.getByLabel("邮箱", { exact: true }).fill(a.email); await page.getByLabel("密码", { exact: true }).fill(a.password);
  const response = page.waitForResponse(r => r.url().endsWith("/api/auth/sign-in/email"));
  await page.getByRole("button", { name: "登录", exact: true }).click(); const limited = await response;
  expect(limited.status()).toBe(429); expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0);
  const blocked = page.getByRole("button", { name: /秒后重试/ }); await expect(blocked).toBeDisabled();
  await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await page.getByLabel("密码", { exact: true }).press("Enter");
  await expect(blocked).toBeDisabled(); expect(attempts).toBe(4);
  await expect(page.getByLabel("邮箱", { exact: true })).toHaveValue(a.email); await expect(page.getByLabel("密码", { exact: true })).toHaveValue(a.password);
  await page.screenshot({ path: ".local/nearby-beta-e2e/login-throttled.png", fullPage: true });
  await expect(page.getByRole("button", { name: "登录", exact: true })).toBeEnabled({ timeout: 15000 });
  await page.getByRole("button", { name: "登录", exact: true }).click(); await expect(page.getByText(a.email, { exact: true })).toBeVisible();
});
test("real login storage failure shows a retryable service error and preserves form inputs", async ({ page }) => {
  const { a } = await accounts(); await page.goto("/");
  await page.getByLabel("邮箱", { exact: true }).fill(a.email); await page.getByLabel("密码", { exact: true }).fill(a.password);
  const pool = testPool(); await pool.query('ALTER TABLE "RequestCounter" RENAME TO "__e2e_unavailable_counter"');
  try {
    const response = page.waitForResponse(r => r.url().endsWith("/api/auth/sign-in/email"));
    await page.getByRole("button", { name: "登录", exact: true }).click(); expect((await response).status()).toBe(503);
    await expect(page.getByText("登录服务暂不可用，请稍后重试", { exact: true })).toBeVisible();
    await expect(page.getByLabel("邮箱", { exact: true })).toHaveValue(a.email); await expect(page.getByLabel("密码", { exact: true })).toHaveValue(a.password);
    await expect(page.getByRole("button", { name: "登录", exact: true })).toBeEnabled();
  } finally { await pool.query('ALTER TABLE "__e2e_unavailable_counter" RENAME TO "RequestCounter"'); await pool.end(); }
  await page.getByRole("button", { name: "登录", exact: true }).click(); await expect(page.getByText(a.email, { exact: true })).toBeVisible();
});
