import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { Pool } from "pg";
import { confirmedLocation } from "../history-fixtures.js";

const password = "GoodPassword123!";
function testPool() {
  const url = process.env.NEARBY_IDENTITY_TEST_DATABASE_URL!;
  const target = new URL(url);
  if (target.hostname !== "127.0.0.1" || !target.pathname.startsWith("/nearby_identity_test")) throw new Error("Refusing non-test database");
  return new Pool({ connectionString: url });
}
test.beforeEach(async () => {
  // Each browser case represents independent actors; rate-limit enforcement has dedicated PostgreSQL tests.
  const pool = testPool();
  try { await pool.query(`DELETE FROM "RequestCounter" WHERE key LIKE 'guest-create:%' OR key LIKE 'auth:%'`); }
  finally { await pool.end(); }
});
async function mailLink(request: APIRequestContext, email: string, fragment: string) {
  let link = "";
  await expect.poll(async () => {
    const messages: string[] = await (await request.get("http://127.0.0.1:3128")).json();
    const mail = messages.filter(message => message.includes(email) && message.includes(fragment)).at(-1);
    link = mail?.match(/http:\/\/localhost:3127\/api\/auth\/[^\s]+/)?.[0] ?? "";
    return link;
  }).not.toBe("");
  return link;
}
async function login(page: Page, email: string, value = password) {
  await page.getByLabel("邮箱", { exact: true }).fill(email);
  await page.getByLabel("密码", { exact: true }).fill(value);
  await page.getByRole("button", { name: "登录", exact: true }).last().click();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
}
async function registerAccount(page: Page, request: APIRequestContext, prefix: string) {
  const email = `${prefix}-${Date.now()}@example.test`;
  const signup = await page.request.post("/api/auth/sign-up/email", { headers: { origin: "http://localhost:3127" }, data: { name: "Test", email, password, callbackURL: "/?verified=1" } });
  expect(signup.ok()).toBe(true);
  await page.goto(await mailLink(request, email, "verify-email"));
  await login(page, email);
  return email;
}
async function search(page: Page) {
  await page.getByRole("button", { name: "探索附近", exact: true }).click();
  await page.getByLabel("地点", { exact: true }).fill("深圳北站");
  await page.getByRole("button", { name: "解析地点", exact: true }).click();
  const choose = page.getByRole("button", { name: /^选用此地点/ });
  await choose.click();
  await page.getByRole("button", { name: "搜索附近", exact: true }).click();
  await expect(page.getByRole("button", { name: "搜索附近", exact: true })).toBeEnabled();
  await expect(page.getByText("附近搜索未完成", { exact: true })).toHaveCount(0);
}
async function editKey(page: Page, key?: string) {
  await page.getByRole("button", { name: "高德 Key 设置", exact: true }).click();
  await page.getByRole("button", { name: /^(添加|更换) Key$/ }).click();
  if (key) {
    await page.getByLabel("新的高德 Key").fill(key.repeat(32));
    await page.getByRole("button", { name: "保存 Key", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
}

test("guest search stays local, reloads, and clears on exit", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "匿名体验", exact: true }).click();
  await search(page);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("nearby.guest.history.v1") ?? "[]").length)).toBe(1);
  expect((await page.request.get("/api/history")).status()).toBe(403);
  await page.reload(); await expect(page.getByText(/匿名体验 · 今日剩余/)).toBeVisible();
  await page.getByRole("button", { name: "最近搜索", exact: true }).click();
  await expect(page.getByText("测试地点", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "退出体验", exact: true }).click();
  await expect(page.getByRole("button", { name: "匿名体验", exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("nearby.guest.history.v1"))).toBeNull();
});
test("registration, mailbox verification, BYOK, cloud history and password reset", async ({ page, request }) => {
  const email = `browser-${Date.now()}@example.test`;
  await page.goto("/"); await page.getByRole("button", { name: "注册 / 登录", exact: true }).click();
  await page.getByRole("button", { name: "注册", exact: true }).click();
  await page.getByLabel("邮箱", { exact: true }).fill(email); await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "注册并发送验证邮件" }).click();
  await expect(page.getByRole("status")).toContainText("检查验证邮件");
  await page.goto(await mailLink(request, email, "verify-email"));
  await login(page, email);
  await editKey(page, "a");
  await expect(page.getByText("Key 已保存，下次搜索时验证。")).toBeVisible();
  await search(page);
  await expect.poll(async () => (await (await page.request.get("/api/history")).json()).items.length).toBe(1);
  const status = await (await page.request.get("/api/account/amap-credential")).json();
  expect(JSON.stringify(status)).not.toContain("a".repeat(32)); expect(status.status).toBe("valid");
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await page.getByRole("button", { name: "注册 / 登录", exact: true }).click();
  await page.getByRole("button", { name: "忘记密码", exact: true }).click();
  await page.getByLabel("邮箱", { exact: true }).fill(email); await page.getByRole("button", { name: "发送重置邮件", exact: true }).click();
  await page.goto(await mailLink(request, email, "reset-password"));
  await page.getByLabel("密码", { exact: true }).fill("ChangedPassword123!"); await page.getByRole("button", { name: "保存新密码" }).click();
  await login(page, email, "ChangedPassword123!");
  expect((await (await page.request.get("/api/history")).json()).items.length).toBe(1);
});
test("identity change propagates to another tab and mobile entry stays usable", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/");
  await page.getByRole("button", { name: "匿名体验", exact: true }).click();
  const second = await context.newPage(); await second.goto("/");
  await expect(second.getByRole("button", { name: "退出体验", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "退出体验", exact: true }).click();
  await expect(second.getByRole("button", { name: "匿名体验", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("account missing, invalid and exhausted keys remain actionable through the real routes", async ({ page, request }) => {
  const email = `credential-${Date.now()}@example.test`, headers = { origin: "http://localhost:3127" };
  expect((await page.request.post("/api/auth/sign-up/email", { headers, data: { name: "Test", email, password, callbackURL: "/?verified=1" } })).ok()).toBe(true);
  await page.goto(await mailLink(request, email, "verify-email")); await login(page, email);
  const missing = await page.request.post("/api/resolve-location", { headers, data: { query: "深圳北站" } });
  expect(missing.status()).toBe(409); expect((await missing.json()).error.code).toBe("CREDENTIAL_REQUIRED");
  for (const [key, code] of [["c", "CREDENTIAL_INVALID"], ["d", "UPSTREAM_QUOTA_EXHAUSTED"]]) {
    await editKey(page, key!);
    await expect(page.getByText("Key 已保存，下次搜索时验证。")).toBeVisible();
    await page.getByRole("button", { name: "探索附近", exact: true }).click();
    await page.getByLabel("地点", { exact: true }).fill("深圳北站");
    const response = page.waitForResponse(value => value.url().endsWith("/api/resolve-location"));
    await page.getByRole("button", { name: "解析地点", exact: true }).click();
    expect((await (await response).json()).error.code).toBe(code);
    await expect(page.getByRole("button", { name: "解析地点", exact: true })).toBeEnabled();
  }
  await page.getByRole("button", { name: "高德 Key 设置", exact: true }).click();
  await page.getByRole("button", { name: "移除 Key", exact: true }).click();
  await page.getByRole("button", { name: "确认移除", exact: true }).click();
  await expect(page.getByText("Key 已移除，搜索历史已保留。")).toBeVisible();
  expect((await (await page.request.get("/api/account/amap-credential")).json()).configured).toBe(false);
});

test("guest exhaustion during an NDJSON search retains completed categories and local history", async ({ page }) => {
  const url = process.env.NEARBY_IDENTITY_TEST_DATABASE_URL!;
  const target = new URL(url);
  if (target.hostname !== "127.0.0.1" || !target.pathname.startsWith("/nearby_identity_test")) throw new Error("Refusing non-test database");
  await page.goto("/"); await page.getByRole("button", { name: "匿名体验", exact: true }).click();
  await page.getByLabel("地点", { exact: true }).fill("深圳北站"); await page.getByRole("button", { name: "解析地点", exact: true }).click();
  await page.getByRole("button", { name: /^选用此地点/ }).click();
  const cookie = (await page.context().cookies()).find(value => value.name === "nearby_guest_identity")!;
  const guestId = cookie.value.split(".")[0];
  const pool = new Pool({ connectionString: url });
  try { await pool.query(`INSERT INTO "GuestDailyUsage" ("guestId",day,used) VALUES ($1,to_char(clock_timestamp() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD'),58) ON CONFLICT ("guestId",day) DO UPDATE SET used=58`, [guestId]); }
  finally { await pool.end(); }
  const response = page.waitForResponse(value => value.url().endsWith("/api/search"));
  await page.getByRole("button", { name: "搜索附近", exact: true }).click();
  expect((await response).headers()["content-type"]).toContain("application/x-ndjson");
  await expect(page.getByText(/2 类完成/)).toBeVisible();
  await expect(page.getByText(/今日匿名体验额度已用完/)).toBeVisible();
  await expect(page.getByRole("button", { name: "搜索附近", exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("nearby.guest.history.v1") ?? "[]").length)).toBe(1);
  expect((await (await page.request.get("/api/guest/usage")).json()).remaining).toBe(0);
});

test("focus, periodic refresh and temporary errors preserve guest authentication forms", async ({ page }) => {
  await page.clock.install();
  await page.goto("/"); await page.getByRole("button", { name: "匿名体验", exact: true }).click();
  await page.getByRole("button", { name: "注册 / 登录", exact: true }).click();
  await page.getByRole("button", { name: "注册", exact: true }).click();
  await page.getByLabel("邮箱", { exact: true }).fill("draft@example.test");
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.clock.fastForward(31000);
  await expect(page.getByRole("heading", { name: "注册账户" })).toBeVisible();
  await expect(page.getByLabel("邮箱", { exact: true })).toHaveValue("draft@example.test");
  await expect(page.getByLabel("密码", { exact: true })).toHaveValue(password);
  await page.route("**/api/identity", route => route.fulfill({ status: 503, json: { error: { message: "测试网络暂不可用" } } }));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("测试网络暂不可用", { exact: true })).toBeVisible();
  await expect(page.getByLabel("密码", { exact: true })).toHaveValue(password);
  await page.unroute("**/api/identity"); await page.getByRole("button", { name: "重新读取身份" }).click();
  await expect(page.getByText("测试网络暂不可用")).toHaveCount(0);
  await page.getByRole("button", { name: "忘记密码", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading", { name: "找回密码" })).toBeVisible();
  await expect(page.getByLabel("邮箱", { exact: true })).toHaveValue("draft@example.test");
});

test("guest registration and verification in a new tab continue to account login", async ({ page, context, request }) => {
  const email = `guest-register-${Date.now()}@example.test`;
  await page.goto("/"); await page.getByRole("button", { name: "匿名体验", exact: true }).click();
  await page.evaluate(() => localStorage.setItem("nearby.guest.history.v1", "[]"));
  await page.getByRole("button", { name: "注册 / 登录", exact: true }).click();
  await page.getByRole("button", { name: "注册", exact: true }).click();
  await page.getByLabel("邮箱", { exact: true }).fill(email); await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "注册并发送验证邮件" }).click();
  await expect(page.getByRole("status")).toContainText("检查验证邮件");
  const verified = await context.newPage(); await verified.goto(await mailLink(request, email, "verify-email"));
  await expect(verified.getByRole("heading", { name: "登录账户" })).toBeVisible();
  await page.bringToFront(); await expect(page.getByRole("heading", { name: "登录账户" })).toBeVisible();
  await login(verified, email);
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("nearby.guest.history.v1"))).toBeNull();
});

test("Key settings survive focus and reauthentication returns to settings with cleared inputs", async ({ page, request }) => {
  const email = await registerAccount(page, request, "reauth");
  await editKey(page, "a");
  await expect(page.getByText("Key 已保存，下次搜索时验证。")).toBeVisible();
  await editKey(page);
  await page.getByLabel("新的高德 Key").fill("b".repeat(32));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByLabel("新的高德 Key")).toHaveValue("b".repeat(32));
  await page.getByRole("button", { name: "取消", exact: true }).click();
  const pool = testPool();
  try { await pool.query(`UPDATE "Session" SET "createdAt"=(now() AT TIME ZONE 'UTC')-interval '20 minutes' WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)`, [email]); } finally { await pool.end(); }
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(async () => (await (await page.request.get("/api/identity")).json()).credentialRequiresReauth).toBe(true);
  await page.getByRole("button", { name: "更换 Key", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "验证身份" })).toBeVisible();
  await page.getByLabel("当前密码", { exact: true }).fill(password);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByLabel("当前密码", { exact: true })).toHaveValue(password);
  await page.getByRole("button", { name: "验证并继续" }).click();
  await expect(page.getByLabel("新的高德 Key")).toHaveValue("");
  expect((await (await page.request.get("/api/account/amap-credential")).json()).lastFour).toBe("aaaa");
});

test("real cross-account switching clears Key drafts and rejects late history responses", async ({ page, context, request }) => {
  await registerAccount(page, request, "history-owner-a");
  await editKey(page);
  await page.getByLabel("新的高德 Key").fill("b".repeat(32));
  const owner = await (await page.request.get("/api/identity")).json();
  let release!: () => void, started!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const reading = new Promise<void>(resolve => { started = resolve; });
  await page.route("**/api/history?*", async route => {
    if (route.request().headers()["x-nearby-session"] !== owner.sessionId) return route.continue();
    started(); await waiting;
    await route.fulfill({ json: { items: [{ id: "old-history", query: "A 私有历史", categoryIds: ["hotel"], radiusMeters: 3000, searchedAt: new Date().toISOString(), confirmedLocation: { ...confirmedLocation, name: "A 私有中心" } }] } }).catch(() => {});
  });
  await page.reload(); await editKey(page); await page.getByLabel("新的高德 Key").fill("b".repeat(32));
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "最近搜索", exact: true }).click(); await reading;
  await editKey(page); await page.getByLabel("新的高德 Key").fill("b".repeat(32));
  const second = await context.newPage(); const emailB = await registerAccount(second, request, "history-owner-b");
  await expect(page.getByText(emailB, { exact: true })).toBeVisible();
  release();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await editKey(page); await expect(page.getByLabel("新的高德 Key")).toHaveValue("");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "最近搜索", exact: true }).click();
  await expect(page.getByRole("heading", { name: "暂无搜索历史" })).toBeVisible();
  await expect(page.getByText("A 私有中心", { exact: true })).toHaveCount(0);
});

test("initial identity failure can retry and expired reset callbacks offer a new request", async ({ page }) => {
  await page.route("**/api/identity", route => route.fulfill({ status: 503, json: { error: { message: "测试身份服务暂不可用" } } }));
  await page.goto("/"); await expect(page.getByText("测试身份服务暂不可用", { exact: true })).toBeVisible();
  await page.unroute("**/api/identity"); await page.getByRole("button", { name: "重新读取身份" }).click();
  await expect(page.getByRole("button", { name: "匿名体验", exact: true })).toBeVisible();
  await page.goto("/?reset=1&error=INVALID_TOKEN");
  await expect(page.getByRole("heading", { name: "找回密码" })).toBeVisible();
  await expect(page.getByRole("button", { name: "发送重置邮件", exact: true })).toBeVisible();
});

test("cross-tab logout cancels an active search and hides private state during revalidation failure", async ({ page, context }) => {
  await page.goto("/"); await page.getByRole("button", { name: "匿名体验", exact: true }).click();
  await page.getByLabel("地点", { exact: true }).fill("深圳北站");
  await page.getByRole("button", { name: "解析地点", exact: true }).click();
  await page.getByRole("button", { name: /^选用此地点/ }).click();
  let release!: () => void, started!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  const active = new Promise<void>(resolve => { started = resolve; });
  await page.route("**/api/search", async route => {
    started!(); await delayed;
    await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: JSON.stringify({ type: "error", error: { message: "旧搜索错误" } }) + "\n" }).catch(() => {});
  });
  await page.getByRole("button", { name: "搜索附近", exact: true }).click(); await active;
  const second = await context.newPage(); await second.goto("/");
  await expect(second.getByRole("button", { name: "退出体验", exact: true })).toBeVisible();
  await page.route("**/api/identity", route => route.fulfill({ status: 503, json: { error: { message: "身份复核暂不可用" } } }));
  await second.getByRole("button", { name: "退出体验", exact: true }).click();
  await expect(page.getByText("身份复核暂不可用", { exact: true })).toBeVisible();
  await expect(page.getByLabel("地点", { exact: true })).toHaveCount(0);
  release!();
  await page.unroute("**/api/identity"); await page.getByRole("button", { name: "重新读取身份" }).click();
  await expect(page.getByRole("button", { name: "匿名体验", exact: true })).toBeVisible();
  await expect(page.getByText("旧搜索错误", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("nearby.guest.history.v1"))).toBeNull();
});

test("late guest usage cannot overwrite a replacement session", async ({ page }) => {
  await page.addInitScript(() => {
    const fixture = window as typeof window & { holdNextUsage?: boolean; releaseUsage?: () => void };
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (String(input) === "/api/guest/usage" && fixture.holdNextUsage) {
        fixture.holdNextUsage = false;
        return new Promise<Response>(resolve => {
          fixture.releaseUsage = () => resolve(Response.json({ remaining: 999, limit: 999, resetsAt: new Date(Date.now() + 86400000).toISOString() }));
        });
      }
      return original(input, init);
    };
  });
  let identity = { kind: "guest", id: "fixture-session-a" };
  await page.route("**/api/identity", route => route.fulfill({ json: identity }));
  await page.route("**/api/guest/usage", route => route.fulfill({ json: { remaining: 60, limit: 60, resetsAt: new Date(Date.now() + 86400000).toISOString() } }));
  await page.goto("/");
  await expect(page.getByText("匿名体验 · 今日剩余 60 / 60 次", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    (window as typeof window & { holdNextUsage?: boolean }).holdNextUsage = true;
    window.dispatchEvent(new Event("focus"));
  });
  await page.waitForFunction(() => typeof (window as typeof window & { releaseUsage?: () => void }).releaseUsage === "function");
  identity = { kind: "guest", id: "fixture-session-b" };
  const refreshed = page.waitForResponse(response => response.url().endsWith("/api/guest/usage"));
  await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "nearby.identity.change", newValue: "replacement" })));
  expect((await (await refreshed).json()).remaining).toBe(60);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  await page.evaluate(() => (window as typeof window & { releaseUsage?: () => void }).releaseUsage!());
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  await expect(page.getByText(/999/)).toHaveCount(0);
  await expect(page.getByText("匿名体验 · 今日剩余 60 / 60 次", { exact: true })).toBeVisible();
});

test("successful local logout clears the workspace even when identity refresh fails", async ({ page }) => {
  await page.goto("/"); await page.getByRole("button", { name: "匿名体验", exact: true }).click();
  await search(page);
  await page.route("**/api/identity", route => route.fulfill({ status: 503, json: { error: { message: "退出后身份服务暂不可用" } } }));
  await page.getByRole("button", { name: "退出体验", exact: true }).click();
  await expect(page.getByText("退出后身份服务暂不可用", { exact: true })).toBeVisible();
  await expect(page.getByLabel("地点", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("nearby.guest.history.v1"))).toBeNull();
  await page.unroute("**/api/identity"); await page.getByRole("button", { name: "重新读取身份" }).click();
  await expect(page.getByRole("button", { name: "匿名体验", exact: true })).toBeVisible();
});

test("verified login displays the real retry window and recovers without losing the form", async ({ page, request }) => {
  const email = await registerAccount(page, request, "verified-rate");
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await page.getByRole("button", { name: "注册 / 登录", exact: true }).click();
  const pool = testPool();
  try { await pool.query(`DELETE FROM "RequestCounter" WHERE key LIKE 'auth:%'`); } finally { await pool.end(); }
  await page.getByLabel("邮箱", { exact: true }).fill(email); await page.getByLabel("密码", { exact: true }).fill("WrongPassword!");
  for (let i = 0; i < 3; i++) {
    const response = page.waitForResponse(r => r.url().endsWith("/api/auth/sign-in/email"));
    await page.locator("form").getByRole("button", { name: "登录", exact: true }).click(); expect((await response).status()).toBe(401);
  }
  await page.getByLabel("密码", { exact: true }).fill(password);
  const response = page.waitForResponse(r => r.url().endsWith("/api/auth/sign-in/email"));
  await page.locator("form").getByRole("button", { name: "登录", exact: true }).click(); expect((await response).status()).toBe(429);
  await expect(page.getByRole("button", { name: /秒后重试/ })).toBeDisabled();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByLabel("密码", { exact: true })).toHaveValue(password);
  await expect(page.locator("form").getByRole("button", { name: "登录", exact: true })).toBeEnabled({ timeout: 15000 });
  await page.locator("form").getByRole("button", { name: "登录", exact: true }).click(); await expect(page.getByText(email, { exact: true })).toBeVisible();
});

test("integrated guest-to-account journey uses the shared Key manager and keeps histories separate", async ({ page, request }) => {
  await page.goto("/"); await page.getByRole("button", { name: "匿名体验", exact: true }).click();
  await search(page);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("nearby.guest.history.v1") ?? "[]").length)).toBe(1);

  const email = await registerAccount(page, request, "integrated-identity");
  expect(await page.evaluate(() => localStorage.getItem("nearby.guest.history.v1"))).toBeNull();
  await expect(page.getByRole("button", { name: "添加 Key", exact: true })).toBeVisible();
  expect((await (await page.request.get("/api/history")).json()).items).toEqual([]);
  await expect(page.getByLabel("新的高德 Key")).toHaveCount(0);
  await editKey(page, "a");
  await expect(page.getByText("待验证", { exact: true })).toBeVisible();
  await search(page);
  await expect.poll(async () => (await (await page.request.get("/api/history")).json()).items.length).toBe(1);

  await editKey(page, "b");
  const identity = await (await page.request.get("/api/identity")).json();
  expect(identity.kind).toBe("account"); expect(identity.email).toBe(email);
  expect(identity.credential.lastFour).toBe("bbbb"); expect(JSON.stringify(identity)).not.toContain("b".repeat(32));
  await search(page);
  await page.getByRole("button", { name: "高德 Key 设置", exact: true }).click();
  await expect(page.getByText("已验证", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "移除 Key", exact: true }).click();
  await page.getByRole("button", { name: "确认移除", exact: true }).click();
  await expect(page.getByText("未配置", { exact: true })).toBeVisible();
  expect((await (await page.request.get("/api/history")).json()).items).toHaveLength(1);
  await page.getByRole("button", { name: "探索附近", exact: true }).click();
  await expect(page.getByRole("button", { name: "前往个人中心", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(page.getByRole("button", { name: "匿名体验", exact: true })).toBeVisible();
  expect((await (await page.request.get("/api/identity")).json()).kind).toBe("none");
  await page.getByRole("button", { name: "匿名体验", exact: true }).click();
  await page.getByRole("button", { name: "最近搜索", exact: true }).click();
  await expect(page.getByRole("heading", { name: "暂无搜索历史" })).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "高德 Key 设置", exact: true })).toHaveCount(0);
  expect((await page.request.get("/api/history")).status()).toBe(403);
});
