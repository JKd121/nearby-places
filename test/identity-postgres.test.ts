import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { SMTPServer } from "smtp-server";
import { Pool } from "pg";
import { configureIdentityTest, resetIdentityDatabase } from "./identity-test-runtime.js";

const url = configureIdentityTest();
const { prisma, getAdmissionRuntime } = await import("../src/db/prisma.js");
const { getAuth } = await import("../src/identity/auth.js");
const { startGuest, endGuest, resolveRequestIdentity } = await import("../src/identity/service.js");
const { saveCredential, loadCredential, credentialStatus } = await import("../src/identity/credentials.js");
const { resolveAmapAccess } = await import("../src/server/amap-access.js");
const { createServerAmapClient } = await import("../src/server/amap.js");
const { consumeCounter } = await import("../src/identity/rate.js");
const { fingerprint, signGuest } = await import("../src/identity/security.js");
const { CATEGORIES } = await import("../src/amap/categories.js");
const { POST: historyPost, GET: historyGet, DELETE: historyDelete } = await import("../app/api/history/route.js");
const { confirmedLocation } = await import("./history-fixtures.js");
const pool = new Pool({ connectionString: url });
const messages: string[] = [];
const smtp = new SMTPServer({ authOptional: true, disabledCommands: ["STARTTLS"], onData(stream, _session, callback) {
  let text = ""; stream.on("data", chunk => { text += chunk.toString(); }); stream.on("end", () => { messages.push(text.replace(/=\r?\n/g, "").replace(/=3D/g, "=")); callback(); });
} });
const origin = "http://localhost:3127";
const req = (path: string, cookie = "", body?: unknown, method?: string) => new Request(origin + path, { method: method ?? (body === undefined ? "GET" : "POST"), headers: { cookie, origin, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const { POST: authPost } = await import("../app/api/auth/[...all]/route.js");
const auth = (path: string, body: unknown) => authPost(req("/api/auth/" + path, "", body));
let userA: { id: string; cookie: string; sessionId: string }, userB: typeof userA;
before(async () => { await resetIdentityDatabase(url); await new Promise<void>(resolve => smtp.listen(25260, "127.0.0.1", resolve)); });
after(async () => { await new Promise<void>(resolve => smtp.close(resolve)); await prisma.$disconnect(); await getAdmissionRuntime().pool.end(); await pool.end(); });
async function register(email: string) {
  const response = await auth("sign-up/email", { name: "Test", email, password: "GoodPassword123!", callbackURL: "/?verified=1" });
  assert.equal(response.status, 200, await response.clone().text());
  const account = await prisma.user.findUniqueOrThrow({ where: { email } });
  assert.equal(account.emailVerified, false);
  const mail = messages.find(message => message.includes("To: " + email))!;
  const verifyUrl = mail.match(/http:\/\/localhost:3127\/api\/auth\/verify-email\?[^\s]+/)?.[0];
  assert.ok(verifyUrl, mail);
  const verification = await getAuth().handler(new Request(verifyUrl));
  assert.ok([200, 302].includes(verification.status), await verification.text());
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { email } })).emailVerified, true);
  const login = await auth("sign-in/email", { email, password: "GoodPassword123!" });
  assert.equal(login.status, 200, await login.clone().text());
  const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  const identity = await resolveRequestIdentity(req("/", cookie));
  assert.equal(identity.kind, "account");
  return { id: account.id, cookie, sessionId: identity.sessionId };
}
test("email verification, scrypt password and two independent sessions", async () => {
  assert.equal((await prisma.searchHistory.findUniqueOrThrow({ where: { id: "legacy-before-upgrade" } })).visitorId, "legacy-browser");
  const resource = await prisma.amapResource.findUniqueOrThrow({ where: { id: "public-test" } });
  assert.equal(resource.dayUsed, 17); assert.equal(resource.monthUsed, 23);
  userA = await register("a@example.test"); userB = await register("b@example.test");
  const account = await prisma.account.findFirstOrThrow({ where: { userId: userA.id } });
  assert.ok(account.password); assert.notEqual(account.password, "GoodPassword123!");
  assert.notEqual(userA.id, userB.id);
});

test("public verified auth endpoints cannot grant themselves beta qualification or disabling fields", async () => {
  const response = await auth("sign-up/email", { name: "Public", email: "no-self-grant@example.test", password: "GoodPassword123!", betaAccess: true, disabledAt: new Date().toISOString() });
  assert.equal(response.status, 200);
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "no-self-grant@example.test" } });
  assert.equal(user.betaAccess, false); assert.equal(user.disabledAt, null);
  const updated = await authPost(req("/api/auth/update-user", userA.cookie, { name: "Still regular", betaAccess: true }));
  assert.equal(updated.status, 200);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: userA.id } })).betaAccess, false);
});
test("identity exposes only the credential freshness hint and retains private no-store headers", async () => {
  const { GET } = await import("../app/api/identity/route.js");
  const response = await GET(req("/api/identity", userA.cookie));
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal((await response.json()).credentialRequiresReauth, false);
  const session = await prisma.session.findUniqueOrThrow({ where: { id: userA.sessionId } });
  try {
    await prisma.session.update({ where: { id: userA.sessionId }, data: { createdAt: new Date(Date.now() - 20 * 60_000) } });
    const stale = await (await GET(req("/api/identity", userA.cookie))).json();
    assert.equal(stale.credentialRequiresReauth, true);
    assert.equal(stale.sessionId, userA.sessionId);
    assert.equal("createdAt" in stale, false);
  } finally { await prisma.session.update({ where: { id: userA.sessionId }, data: { createdAt: session.createdAt } }); }
});

test("credentials are encrypted, unique, owner-bound and return masked status", async () => {
  await saveCredential(userA.id, "a".repeat(32)); await saveCredential(userB.id, "b".repeat(32));
  const a = await loadCredential(userA.id), b = await loadCredential(userB.id);
  assert.equal(a.key, "a".repeat(32)); assert.equal(b.key, "b".repeat(32));
  assert.ok(!JSON.stringify(await credentialStatus(userA.id)).includes("a".repeat(32)));
  assert.ok(!a.record.encryptedKey.includes(a.key));
  await saveCredential(userA.id, "c".repeat(32));
  assert.equal(await prisma.userApiCredential.count({ where: { userId: userA.id } }), 1);
  assert.equal((await loadCredential(userA.id)).record.version, 2);
  await saveCredential(userA.id, "a".repeat(32));
});
test("real unified transport selects each logged-in user's key without public budget writes", async () => {
  const seen: string[] = [], original = globalThis.fetch;
  const before = await prisma.amapResource.findUniqueOrThrow({ where: { id: "public-test" } });
  globalThis.fetch = async input => { seen.push(new URL(String(input)).searchParams.get("key")!); return Response.json({ status: "1", pois: [] }); };
  try {
    await Promise.all([userA, userB].map(async user => {
      const access = await resolveAmapAccess(req("/api/search", user.cookie), 8000);
      await createServerAmapClient(undefined, undefined, undefined, access).searchNearby({ longitude: 114, latitude: 22 }, CATEGORIES[0]!, { pageNumber: 1, pageSize: 25, radiusMeters: 3000 });
    }));
    assert.deepEqual(seen.sort(), ["a".repeat(32), "b".repeat(32)]);
    assert.equal(await prisma.requestLease.count(), 0);
    assert.equal((await prisma.amapResource.findUniqueOrThrow({ where: { id: "public-test" } })).dayUsed, before.dayUsed);
  } finally { globalThis.fetch = original; }
});
test("page two routes use each verified account credential", async () => {
  const { POST: page } = await import("../app/api/search/page/route.js");
  const original = globalThis.fetch; const calls: Array<{ key: string | null; page: string | null }> = [];
  globalThis.fetch = async input => { const url = new URL(String(input)); calls.push({ key: url.searchParams.get("key"), page: url.searchParams.get("page_num") }); return Response.json({ status: "1", pois: [] }); };
  try {
    for (const user of [userA, userB]) {
      const response = await page(req("/api/search/page", user.cookie, { center: { longitude: 114, latitude: 22 }, categoryId: "hotel", radiusMeters: 3000 }));
      assert.equal(response.status, 200, await response.clone().text());
    }
    assert.deepEqual(calls, [{ key: "a".repeat(32), page: "2" }, { key: "b".repeat(32), page: "2" }]);
  } finally { globalThis.fetch = original; }
});
test("guest 60th/61st admissions atomically share public budget; exit retains daily usage", async () => {
  const guest = await startGuest(req("/api/guest/session", "", {}));
  const cookie = `nearby_guest_identity=${guest.identity}; nearby_guest_session=${guest.session}`;
  const identity = await resolveRequestIdentity(req("/", cookie)); assert.equal(identity.kind, "guest"); if (identity.kind !== "guest") return;
  await prisma.guestDailyUsage.create({ data: { guestId: identity.guestId, day: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }), used: 59 } });
  const access = await resolveAmapAccess(req("/api/search", cookie), 8000);
  const permit = await access.options.beforeAttempt("nearby", new AbortController().signal); permit?.assertValid(); await permit?.release?.();
  await assert.rejects(access.options.beforeAttempt("nearby", new AbortController().signal), error => typeof error === "object" && error !== null && "code" in error && error.code === "GUEST_DAILY_EXHAUSTED");
  assert.equal((await prisma.amapResource.findUniqueOrThrow({ where: { id: "public-test" } })).dayUsed, 1);
  assert.equal((await historyGet(req("/api/history", cookie))).status, 403);
  await endGuest(req("/api/guest/session", cookie));
  await assert.rejects(resolveRequestIdentity(req("/", cookie)));
  const again = await startGuest(req("/api/guest/session", cookie, {}));
  assert.equal(again.identity, guest.identity);
  assert.equal(await prisma.searchHistory.count({ where: { userId: { not: null } } }), 0);
});
test("multi-instance counters enforce atomic limits", async () => {
  const results = await Promise.all(Array.from({ length: 20 }, () => consumeCounter("concurrent-test", 60, 3)));
  assert.equal(results.filter(result => result.allowed).length, 3);
});
test("credential replacement/deletion invalidates previously resolved access", async () => {
  const old = await resolveAmapAccess(req("/api/search", userA.cookie), 8000);
  await saveCredential(userA.id, "c".repeat(32));
  await assert.rejects(old.options.beforeAttempt("nearby", new AbortController().signal), /Identity admission refused/);
  await prisma.userApiCredential.deleteMany({ where: { userId: userA.id } });
  await assert.rejects(resolveAmapAccess(req("/api/search", userA.cookie), 8000), /配置/);
  await saveCredential(userA.id, "a".repeat(32));
});
test("shared-key pacing and global expiring leases are enforced by PostgreSQL", async () => {
  await saveCredential(userB.id, "a".repeat(32));
  assert.equal((await loadCredential(userB.id)).record.fingerprint, fingerprint("a".repeat(32)));
  const a = await resolveAmapAccess(req("/api/search", userA.cookie), 8000), b = await resolveAmapAccess(req("/api/search", userB.cookie), 8000);
  const times: number[] = [];
  await Promise.all([a, b].map(async access => { const permit = await access.options.beforeAttempt("nearby", new AbortController().signal); permit?.assertValid(); times.push(Date.now()); await permit?.release?.(); }));
  times.sort(); assert.ok(times[1]! - times[0]! >= 450);
  await prisma.requestLease.createMany({ data: Array.from({ length: 12 }, () => ({ id: randomUUID(), subject: "fixture", expiresAt: new Date(Date.now() + 60000) })) });
  await assert.rejects(a.options.beforeAttempt("nearby", new AbortController().signal));
  await prisma.requestLease.updateMany({ data: { expiresAt: new Date(0) } });
  const permit = await a.options.beforeAttempt("nearby", new AbortController().signal); permit?.assertValid(); await permit?.release?.();
});
test("account cloud history is isolated and anonymous legacy rows stay separate", async () => {
  const body = { query: "深圳北站", categoryIds: ["hotel"], radiusMeters: 3000, confirmedLocation };
  assert.equal((await historyPost(req("/api/history", userA.cookie, body))).status, 200);
  const a = await (await historyGet(req("/api/history", userA.cookie))).json();
  const b = await (await historyGet(req("/api/history", userB.cookie))).json();
  assert.equal(a.items.length, 1); assert.equal(b.items.length, 0);
  assert.equal((await historyDelete(req("/api/history", userB.cookie, { id: a.items[0].id }, "DELETE"))).status, 404);
  await prisma.searchHistory.create({ data: { visitorId: "legacy-visitor", dedupeKey: "legacy", query: "legacy", categoryIds: ["hotel"], radiusMeters: 3000 } });
  assert.equal((await (await historyGet(req("/api/history", userA.cookie))).json()).items.length, 1);
});
test("session revocation blocks additional upstream calls", async () => {
  const access = await resolveAmapAccess(req("/api/search", userB.cookie), 8000);
  await prisma.session.delete({ where: { id: userB.sessionId } });
  await assert.rejects(access.options.beforeAttempt("nearby", new AbortController().signal), /Identity admission refused/);
  await assert.rejects(resolveRequestIdentity(req("/", userB.cookie)), /过期/);
});

test("two independent Node processes share the same atomic request counter", async () => {
  const run = () => new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "--conditions=react-server", "test/identity-counter-worker.ts"], { env: process.env, windowsHide: true });
    let out = ""; child.stdout.on("data", chunk => { out += String(chunk); }); child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve(Number(out)) : reject(new Error("worker failed")));
  });
  const results = await Promise.all([run(), run()]); assert.equal(results.reduce((a, b) => a + b, 0), 3);
});
test("upstream credential, quota and QPS errors remain actionable and redact keys", async () => {
  const original = globalThis.fetch, originalLog = console.error; const logs: unknown[] = [];
  try {
    console.error = (...args) => { logs.push(args); };
    for (const [code, expected] of [["10001", "CREDENTIAL_INVALID"], ["10003", "UPSTREAM_QUOTA_EXHAUSTED"], ["10044", "UPSTREAM_QUOTA_EXHAUSTED"], ["40000", "UPSTREAM_QUOTA_EXHAUSTED"], ["10021", "UPSTREAM_RATE_LIMITED"]]) {
      await saveCredential(userA.id, "a".repeat(32));
      globalThis.fetch = async () => Response.json({ status: "0", infocode: code, info: "SECRET " + "a".repeat(32) });
      const access = await resolveAmapAccess(req("/api/search", userA.cookie), 8000);
      await assert.rejects(createServerAmapClient(undefined, undefined, undefined, access).searchNearby({ longitude: 114, latitude: 22 }, CATEGORIES[0]!, { pageNumber: 1, pageSize: 25, radiusMeters: 3000 }), error => typeof error === "object" && error !== null && "code" in error && error.code === expected);
    }
    assert.ok(!JSON.stringify(logs).includes("a".repeat(32))); assert.ok(!JSON.stringify(logs).includes("SECRET"));
    assert.equal(await prisma.requestLease.count(), 0);
  } finally { globalThis.fetch = original; console.error = originalLog; }
});
test("corrupt credential ciphertext fails before any upstream attempt", async () => {
  await prisma.userApiCredential.update({ where: { userId: userA.id }, data: { encryptedKey: "corrupt", status: "pending" } });
  await assert.rejects(resolveAmapAccess(req("/api/search", userA.cookie), 8000), /读取失败/);
  await saveCredential(userA.id, "a".repeat(32));
});
test("expired verification and reset tokens are handled safely", async () => {
  const verify = await getAuth().handler(new Request(origin + "/api/auth/verify-email?token=invalid&callbackURL=/"));
  assert.ok([302, 400, 401].includes(verify.status));
  const reset = await auth("reset-password", { token: "invalid", newPassword: "ChangedPassword123!" });
  assert.equal(reset.status, 400);
});
test("login requests are rate limited across requests", async () => {
  await prisma.requestCounter.deleteMany({ where: { key: { startsWith: "auth:" } } });
  const before = await prisma.session.count();
  try {
    for (let i = 0; i < 3; i++) assert.equal((await auth("sign-in/email", { email: "missing@example.test", password: "WrongPassword!" })).status, 401);
    const blocked = await auth("sign-in/email", { email: "missing@example.test", password: "WrongPassword!" });
    assert.equal(blocked.status, 429); assert.ok(Number(blocked.headers.get("retry-after")) > 0);
    assert.equal(blocked.headers.getSetCookie().length, 0); assert.equal(await prisma.session.count(), before);
  } finally { await prisma.requestCounter.deleteMany({ where: { key: { startsWith: "auth:" } } }); }
});

test("stale browser session markers reject requests after a different account logs in", async () => {
  const request = req("/api/search", userA.cookie); request.headers.set("x-nearby-session", "different-session");
  await assert.rejects(resolveAmapAccess(request, 8000), /身份已变化/);
});
test("account admission remains independent of guest budgets and public key availability", async () => {
  const guestLimit = process.env.NEARBY_GUEST_DAILY_LIMIT, publicKey = process.env.AMAP_WEB_SERVICE_KEY;
  try {
    process.env.NEARBY_GUEST_DAILY_LIMIT = "invalid"; delete process.env.AMAP_WEB_SERVICE_KEY;
    await prisma.amapResource.update({ where: { id: "public-test" }, data: { enabled: false } });
    const access = await resolveAmapAccess(req("/api/search", userA.cookie), 8000);
    const permit = await access.options.beforeAttempt("nearby", new AbortController().signal); permit?.assertValid(); await permit?.release?.();
  } finally {
    if (guestLimit === undefined) delete process.env.NEARBY_GUEST_DAILY_LIMIT; else process.env.NEARBY_GUEST_DAILY_LIMIT = guestLimit;
    process.env.AMAP_WEB_SERVICE_KEY = publicKey!;
    await prisma.amapResource.update({ where: { id: "public-test" }, data: { enabled: true } });
  }
});

test("functional rollback disables account search while preserving account access", async () => {
  process.env.NEARBY_ACCOUNT_SEARCH_ENABLED = "false";
  try {
    await assert.rejects(resolveAmapAccess(req("/api/search", userA.cookie), 8000), /维护/);
    assert.equal((await resolveRequestIdentity(req("/", userA.cookie))).kind, "account");
    assert.equal((await historyGet(req("/api/history", userA.cookie))).status, 200);
  } finally { delete process.env.NEARBY_ACCOUNT_SEARCH_ENABLED; }
});

test("password reset revokes sessions and a consumed reset token is rejected", async () => {
  const response = await auth("request-password-reset", { email: "a@example.test", redirectTo: "/?reset=1" });
  assert.equal(response.status, 200);
  const mail = messages.filter(message => message.includes("a@example.test") && message.includes("reset-password")).at(-1)!;
  const link = mail.match(/http:\/\/localhost:3127\/api\/auth\/reset-password\/[^\s]+/)?.[0]; assert.ok(link);
  const token = new URL(link).pathname.split("/").at(-1)!;
  const reset = await auth("reset-password", { token, newPassword: "ChangedPassword123!" });
  assert.equal(reset.status, 200, await reset.clone().text());
  assert.equal(await prisma.session.count({ where: { userId: userA.id } }), 0);
  const replay = await auth("reset-password", { token, newPassword: "AnotherPassword123!" }); assert.equal(replay.status, 400);
});
test("SMTP failure leaves the account unverified and creates no login session", async () => {
  process.env.SMTP_PORT = "1";
  try {
    const response = await auth("sign-up/email", { name: "Mail failure", email: "smtp-failure@example.test", password: "GoodPassword123!" });
    assert.ok(response.status >= 400);
    const user = await prisma.user.findUnique({ where: { email: "smtp-failure@example.test" } });
    if (user) { assert.equal(user.emailVerified, false); assert.equal(await prisma.session.count({ where: { userId: user.id } }), 0); }
  } finally { process.env.SMTP_PORT = "25260"; }
});

test("expired sessions stay isolated and yesterday's guest allowance resets independently", async () => {
  const login = await getAuth().api.signInEmail({ body: { email: "b@example.test", password: "GoodPassword123!" }, asResponse: true });
  const accountCookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  const account = await resolveRequestIdentity(req("/", accountCookie));
  await prisma.session.update({ where: { id: account.sessionId }, data: { expiresAt: new Date(0) } });
  const id = randomUUID(), token = randomUUID(), expiresAt = new Date(Date.now() + 365 * 86400000);
  await prisma.guestIdentity.create({ data: { id, expiresAt } });
  await prisma.guestSession.create({ data: { id: token, guestId: id, expiresAt: new Date(0) } });
  const cookie = `nearby_guest_identity=${signGuest(id, +expiresAt)}; nearby_guest_session=${token}`;
  await assert.rejects(resolveRequestIdentity(req("/", cookie)), /选择/);
  await prisma.guestSession.update({ where: { id: token }, data: { expiresAt } });
  await assert.rejects(resolveRequestIdentity(req("/", accountCookie + "; " + cookie)), /过期/);
  const { budgetPeriod } = await import("../src/admission/service.js");
  const yesterday = budgetPeriod(new Date(Date.now() - 86400000)).day, today = budgetPeriod(new Date()).day;
  await prisma.guestDailyUsage.create({ data: { guestId: id, day: yesterday, used: 60 } });
  const access = await resolveAmapAccess(req("/api/search", cookie), 8000);
  const permit = await access.options.beforeAttempt("nearby", new AbortController().signal); permit?.assertValid(); await permit?.release?.();
  assert.equal((await prisma.guestDailyUsage.findUniqueOrThrow({ where: { guestId_day: { guestId: id, day: today } } })).used, 1);
  assert.equal((await prisma.guestDailyUsage.findUniqueOrThrow({ where: { guestId_day: { guestId: id, day: yesterday } } })).used, 60);
});
