import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";

function testPool() {
  const url = process.env.NEARBY_IDENTITY_TEST_DATABASE_URL!;
  const target = new URL(url);
  if (target.hostname !== "127.0.0.1" || !target.pathname.startsWith("/nearby_identity_test")) throw new Error("Refusing non-test database");
  return new Pool({ connectionString: url });
}
async function sql(query: string, values?: unknown[]) { const pool = testPool(); try { return await pool.query(query, values); } finally { await pool.end(); } }
async function setup(page: Page) {
  await sql(`DELETE FROM "RequestCounter" WHERE key LIKE 'auth:%'`);
  const { a } = JSON.parse(await readFile(".local/nearby-beta-e2e/accounts.json", "utf8"));
  await page.goto("/"); await page.getByLabel("邮箱", { exact: true }).fill(a.email); await page.getByLabel("密码", { exact: true }).fill(a.password);
  await page.getByRole("button", { name: "登录", exact: true }).click(); await expect(page.getByText(a.email, { exact: true })).toBeVisible();
  const owner = await (await page.request.get("/api/identity")).json();
  const response = await page.request.put("/api/account/amap-credential", { headers: { origin: "http://localhost:3127", "x-nearby-session": owner.sessionId }, data: { key: "a".repeat(32) } });
  expect(response.ok()).toBe(true);
  await page.reload(); await page.getByRole("button", { name: "高德 Key 设置", exact: true }).click();
  return { ...a, sessionId: owner.sessionId };
}
async function expire(page: Page, sessionId: string) {
  await sql(`UPDATE "Session" SET "createdAt"=(now() AT TIME ZONE 'UTC')-interval '20 minutes' WHERE id=$1`, [sessionId]);
  const refresh = page.waitForResponse(r => r.url().endsWith("/api/identity"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus"))); expect((await (await refresh).json()).credentialRequiresReauth).toBe(true);
}

test("overview distinguishes missing, pending, valid and invalid credentials without exposing a Key", async ({ page }) => {
  await setup(page);
  const owner = await (await page.request.get("/api/identity")).json();
  let credential = { configured: true, status: "valid", lastFour: "aaaa" };
  await page.route("**/api/identity", route => route.fulfill({ json: { ...owner, credential } }));
  for (const [status, text] of [["valid", "已验证"], ["pending", "待验证"], ["invalid", "需要更新"], ["missing", "未配置"]] as const) {
    credential = { configured: status !== "missing", status, lastFour: "aaaa" };
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByText(text, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: status === "missing" ? "添加 Key" : "更换 Key", exact: true })).toBeVisible();
    await expect(page.getByLabel("新的高德 Key")).toHaveCount(0);
    if (status === "missing") {
      await page.getByRole("button", { name: "探索附近", exact: true }).click();
      await page.getByLabel("地点", { exact: true }).fill("保留的地点");
      await page.getByRole("button", { name: "前往个人中心", exact: true }).click();
      await page.getByRole("button", { name: "探索附近", exact: true }).click();
      await expect(page.getByLabel("地点", { exact: true })).toHaveValue("保留的地点");
      await page.getByRole("button", { name: "高德 Key 设置", exact: true }).click();
    }
  }
  credential = { configured: true, status: "valid", lastFour: "aaaa" };
  await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await expect(page.getByText("已验证", { exact: true })).toBeVisible();
  expect(await page.locator("body").innerText()).not.toContain("a".repeat(32));
  await expect(page.getByRole("link", { name: "申请高德 Key" })).toHaveAttribute("target", "_blank");
  await expect(page.getByRole("button", { name: "重新登录以管理凭证" })).toHaveCount(0);
  await page.screenshot({ path: ".local/nearby-beta-e2e/key-overview-desktop.png", fullPage: true, animations: "disabled" });
});

test("editor supports keyboard focus, hidden drafts, retry and busy protection on mobile", async ({ page }) => {
  await setup(page); await page.setViewportSize({ width: 390, height: 844 });
  const trigger = page.getByRole("button", { name: "更换 Key", exact: true });
  await trigger.click(); const input = page.getByLabel("新的高德 Key"); const dialog = page.getByRole("dialog");
  await input.fill("b".repeat(32)); await expect(input).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "显示 Key", exact: true }).click(); await expect(input).toHaveAttribute("type", "text");
  for (let i = 0; i < 8; i++) { await page.keyboard.press("Tab"); expect(await page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(true); }
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  await trigger.click(); await expect(input).toHaveValue(""); await expect(input).toHaveAttribute("type", "password");
  let attempts = 0, release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/account/amap-credential", async route => {
    if (route.request().method() !== "PUT") return route.continue();
    attempts++;
    if (attempts === 1) return route.fulfill({ status: 503, json: { error: { message: "暂时无法保存，请重试" } } });
    await waiting; await route.fulfill({ json: { configured: true, status: "pending", lastFour: "bbbb" } });
  });
  await input.fill("invalid"); await page.getByRole("button", { name: "保存 Key", exact: true }).click(); expect(attempts).toBe(0);
  await input.fill("b".repeat(32)); await page.getByRole("button", { name: "保存 Key", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("暂时无法保存，请重试"); await expect(input).toHaveValue("b".repeat(32));
  await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await expect(input).toHaveValue("b".repeat(32));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: ".local/nearby-beta-e2e/key-editor-mobile.png", fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "保存 Key", exact: true }).click(); await expect(page.getByRole("button", { name: "处理中…" })).toBeDisabled();
  await page.keyboard.press("Escape"); await expect(dialog).toBeVisible(); await expect(page.getByRole("button", { name: "取消", exact: true })).toBeDisabled();
  release(); await expect(dialog).toHaveCount(0); await expect(page.getByText("Key 已保存，下次搜索时验证。", { exact: true })).toBeVisible();
  await trigger.click(); await expect(input).toHaveValue(""); await page.mouse.click(2, 2); await expect(dialog).toHaveCount(0);
});

test("stale sessions verify the current account then resume editing or removal without automatic deletion", async ({ page }) => {
  const account = await setup(page); await expire(page, account.sessionId);
  await page.getByRole("button", { name: "更换 Key", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "验证身份" })).toBeVisible(); await expect(page.getByLabel("邮箱", { exact: true })).toHaveAttribute("readonly", "");
  await page.getByLabel("当前密码").fill("WrongPassword!"); await page.getByRole("button", { name: "验证并继续" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("邮箱或密码有误");
  await page.getByLabel("当前密码").fill(account.password); await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByLabel("当前密码")).toHaveValue(account.password); await page.getByRole("button", { name: "验证并继续" }).click();
  await expect(page.getByRole("dialog", { name: "更换高德 Key" })).toBeVisible(); await expect(page.getByLabel("新的高德 Key")).toHaveValue("");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "探索附近", exact: true }).click(); await page.getByRole("button", { name: "高德 Key 设置", exact: true }).click(); await expect(page.getByRole("dialog")).toHaveCount(0);
  const owner = await (await page.request.get("/api/identity")).json(); await sql(`DELETE FROM "RequestCounter" WHERE key LIKE 'auth:%'`); await expire(page, owner.sessionId);
  await page.getByRole("button", { name: "移除 Key", exact: true }).click(); await page.getByLabel("当前密码").fill(account.password); await page.getByRole("button", { name: "验证并继续" }).click();
  await expect(page.getByRole("dialog", { name: "移除高德 Key？" })).toBeVisible();
  expect((await (await page.request.get("/api/account/amap-credential")).json()).configured).toBe(true);
  await page.getByRole("button", { name: "取消", exact: true }).click();
});

test("expiry during editing discards the draft and requests verification before retrying", async ({ page }) => {
  const account = await setup(page); await page.getByRole("button", { name: "更换 Key", exact: true }).click(); await page.getByLabel("新的高德 Key").fill("b".repeat(32));
  // Skip identity refresh so only the mutation discovers expiry.
  await sql(`UPDATE "Session" SET "createdAt"=(now() AT TIME ZONE 'UTC')-interval '20 minutes' WHERE id=$1`, [account.sessionId]);
  await page.getByRole("button", { name: "保存 Key", exact: true }).click(); await expect(page.getByRole("dialog", { name: "验证身份" })).toBeVisible();
  await page.getByLabel("当前密码").fill(account.password); await page.getByRole("button", { name: "验证并继续" }).click();
  await expect(page.getByLabel("新的高德 Key")).toHaveValue("");
  expect((await (await page.request.get("/api/account/amap-credential")).json()).lastFour).toBe("aaaa");
  await page.getByLabel("新的高德 Key").fill("b".repeat(32));
  const current = await (await page.request.get("/api/identity")).json();
  await sql('DELETE FROM "Session" WHERE id=$1', [current.sessionId]);
  await page.getByRole("button", { name: "保存 Key", exact: true }).click();
  await expect(page.getByRole("heading", { name: "登录 Nearby" })).toBeVisible();
  await expect(page.getByLabel("新的高德 Key")).toHaveCount(0);
  await expect(page.getByLabel("密码", { exact: true })).toHaveValue("");
});

test("removal requires confirmation and retains cloud history; a new Key can be added again", async ({ page }) => {
  await setup(page); const history = await (await page.request.get("/api/history")).json();
  await page.getByRole("button", { name: "移除 Key", exact: true }).click(); await expect(page.getByRole("button", { name: "确认移除" })).toBeVisible();
  await page.screenshot({ path: ".local/nearby-beta-e2e/key-remove-desktop.png", fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "确认移除" }).click(); await expect(page.getByText("未配置", { exact: true })).toBeVisible();
  expect((await (await page.request.get("/api/account/amap-credential")).json()).configured).toBe(false);
  expect(await (await page.request.get("/api/history")).json()).toEqual(history);
  await page.reload(); await expect(page.getByRole("button", { name: "添加 Key", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: ".local/nearby-beta-e2e/key-missing-mobile.png", fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "添加 Key", exact: true }).click(); await page.getByLabel("新的高德 Key").fill("a".repeat(32)); await page.getByRole("button", { name: "保存 Key", exact: true }).click(); await expect(page.getByRole("dialog")).toHaveCount(0);
});
