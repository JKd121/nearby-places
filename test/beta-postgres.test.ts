import assert from "node:assert/strict";
import { before, after, beforeEach, test } from "node:test";
import { configureIdentityTest, resetIdentityDatabase } from "./identity-test-runtime.js";

process.env.NEARBY_IDENTITY_TEST_ACCESS_MODE = "local-beta";
const url = configureIdentityTest();
delete process.env.SMTP_HOST; delete process.env.SMTP_FROM;
const { prisma, getAdmissionRuntime } = await import("../src/db/prisma.js");
const { createTestAccount, manageTestAccount } = await import("../src/identity/test-accounts.js");
const { getAuth } = await import("../src/identity/auth.js");
const { accessMode } = await import("../src/identity/access-mode.js");
const { resolveRequestIdentity, startGuest, GUEST_ID_COOKIE, GUEST_SESSION_COOKIE } = await import("../src/identity/service.js");
const { saveCredential, loadCredential, credentialStatus } = await import("../src/identity/credentials.js");
const { resolveAmapAccess } = await import("../src/server/amap-access.js");
const { POST, GET } = await import("../app/api/auth/[...all]/route.js");
const { GET: identityGet } = await import("../app/api/identity/route.js");
const { GET: historyGet } = await import("../app/api/history/route.js");
const { PUT: credentialPut, DELETE: credentialDelete, GET: credentialGet } = await import("../app/api/account/amap-credential/route.js");
const origin = "http://localhost:3127";
const req = (path: string, cookie = "", body?: unknown, method?: string) => new Request(origin + path, { method: method ?? (body === undefined ? "GET" : "POST"), headers: { cookie, origin, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const login = (email: string, password: string) => POST(req("/api/auth/sign-in/email", "", { email, password }));
const cookieOf = (response: Response) => response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
let a: Awaited<ReturnType<typeof createTestAccount>>, b: typeof a, cookie: string;
before(async () => {
  await resetIdentityDatabase(url, async (name, pool) => {
    if (name === "20261107000000_private_beta_access") {
      await pool.query(`INSERT INTO "User" (id,name,email,"emailVerified","updatedAt") VALUES ('pre-beta-user','Legacy','legacy-beta@example.test',true,now())`);
      await pool.query(`INSERT INTO "Account" (id,"accountId","providerId","userId",password,"updatedAt") VALUES ('pre-beta-password','pre-beta-user','credential','pre-beta-user','legacy-hash-sentinel',now())`);
      await pool.query(`INSERT INTO "UserApiCredential" (id,"userId","encryptedKey","encryptionVersion",fingerprint,"lastFour","updatedAt") VALUES ('pre-beta-key','pre-beta-user','ciphertext-sentinel',1,'fingerprint-sentinel','1234',now())`);
    }
  });
  a = await createTestAccount("beta-a@example.test"); b = await createTestAccount("beta-b@example.test");
  cookie = cookieOf(await login(a.email, a.password));
});
beforeEach(async () => { process.env.NEARBY_ACCESS_MODE = "local-beta"; await prisma.requestCounter.deleteMany(); });
after(async () => { await prisma.$disconnect(); await getAdmissionRuntime().pool.end(); });

test("precreated accounts log in without SMTP and preserve unverified email state", async () => {
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: a.userId } })).emailVerified, false);
  assert.equal((await login(a.email, a.password)).status, 200);
  assert.equal((await login(a.email, "wrong-password")).status, 401);
  assert.equal((await resolveRequestIdentity(req("/", cookie))).kind, "account");
  assert.equal((await (await identityGet(req("/api/identity", cookie))).json()).accessMode, "local-beta");
  const account = await prisma.account.findFirstOrThrow({ where: { userId: a.userId } });
  assert.notEqual(account.password, a.password);
  await assert.rejects(createTestAccount(a.email), /账号已存在/);
});
test("incremental beta migrations preserve existing accounts, ciphertext, public counters and history", async () => {
  const legacy = await prisma.user.findUniqueOrThrow({ where: { id: "pre-beta-user" } });
  assert.equal(legacy.disabledAt, null); assert.equal(legacy.betaAccess, false); assert.equal(legacy.emailVerified, true);
  assert.equal((await prisma.account.findUniqueOrThrow({ where: { id: "pre-beta-password" } })).password, "legacy-hash-sentinel");
  assert.equal((await prisma.userApiCredential.findUniqueOrThrow({ where: { id: "pre-beta-key" } })).encryptedKey, "ciphertext-sentinel");
  assert.equal((await prisma.amapResource.findUniqueOrThrow({ where: { id: "public-test" } })).dayUsed, 17);
  assert.equal((await prisma.amapResource.findUniqueOrThrow({ where: { id: "public-test" } })).monthUsed, 23);
  assert.equal((await prisma.searchHistory.findUniqueOrThrow({ where: { id: "legacy-before-upgrade" } })).visitorId, "legacy-browser");
});
test("direct registration and all email endpoints are closed in both beta modes", async () => {
  for (const mode of ["local-beta", "private-beta"]) {
    process.env.NEARBY_ACCESS_MODE = mode;
    for (const path of ["sign-up/email", "send-verification-email", "request-password-reset", "reset-password", "change-email", "verify-email?token=fake"]) {
      const response = await POST(req("/api/auth/" + path, "", { email: "outsider@example.test", password: "GoodPassword123!", name: "Outsider" }));
      assert.equal(response.status, 403, path);
    }
    assert.equal((await GET(req("/api/auth/verify-email?token=fake"))).status, 403);
    await assert.rejects(getAuth().api.signUpEmail({ body: { email: "direct@example.test", password: "GoodPassword123!", name: "Direct" } }));
  }
  assert.equal(await prisma.user.count({ where: { betaAccess: true } }), 2);
});
test("local guests work, private mode rejects new and existing guest sessions across routes", async () => {
  const guest = await startGuest(req("/api/guest/session"));
  const guestCookie = `${GUEST_ID_COOKIE}=${guest.identity}; ${GUEST_SESSION_COOKIE}=${guest.session}`;
  assert.equal((await resolveRequestIdentity(req("/", guestCookie))).kind, "guest");
  process.env.NEARBY_ACCESS_MODE = "private-beta";
  await assert.rejects(startGuest(req("/api/guest/session")), /内测账号/);
  await assert.rejects(resolveRequestIdentity(req("/", guestCookie)), /内测账号/);
  await assert.rejects(resolveAmapAccess(req("/api/search", guestCookie), 500), /内测账号/);
  assert.equal((await historyGet(req("/api/history", guestCookie))).status, 401);
  assert.equal((await credentialGet(req("/api/account/amap-credential", guestCookie))).status, 401);
  assert.equal((await (await identityGet(req("/api/identity", guestCookie))).json()).kind, "none");
  assert.equal((await login(a.email, a.password)).status, 200);
});
test("owner-bound Key selection, replacement, deletion and reauthentication remain enforced", async () => {
  await saveCredential(a.userId, "a".repeat(32)); await saveCredential(b.userId, "b".repeat(32));
  const otherCookie = cookieOf(await login(b.email, b.password));
  assert.equal((await resolveAmapAccess(req("/api/search", cookie), 1000)).key, "a".repeat(32));
  assert.equal((await resolveAmapAccess(req("/api/search", otherCookie), 1000)).key, "b".repeat(32));
  assert.equal((await credentialPut(req("/api/account/amap-credential", cookie, { key: "c".repeat(32), userId: b.userId }, "PUT"))).status, 400);
  assert.equal((await credentialPut(req("/api/account/amap-credential", cookie, { key: "c".repeat(32) }, "PUT"))).status, 200);
  assert.equal((await loadCredential(b.userId)).key, "b".repeat(32));
  assert.ok(!JSON.stringify(await credentialStatus(a.userId)).includes("c".repeat(32)));
  const identity = await resolveRequestIdentity(req("/", cookie));
  await prisma.session.update({ where: { id: identity.sessionId }, data: { createdAt: new Date(Date.now() - 16 * 60000) } });
  assert.equal((await credentialDelete(req("/api/account/amap-credential", cookie, undefined, "DELETE"))).status, 403);
  cookie = cookieOf(await login(a.email, a.password));
  assert.equal((await credentialDelete(req("/api/account/amap-credential", cookie, undefined, "DELETE"))).status, 200);
  assert.equal((await credentialStatus(a.userId)).configured, false);
});
test("unverified beta account passes actual final PostgreSQL admission; old modes default to verified", async () => {
  await saveCredential(a.userId, "d".repeat(32));
  const access = await resolveAmapAccess(req("/api/search", cookie), 1000);
  const permit = await access.options.beforeAttempt("nearby", new AbortController().signal); await permit?.release?.();
  process.env.NEARBY_ACCESS_MODE = "verified";
  await assert.rejects(resolveRequestIdentity(req("/", cookie)), /验证邮箱/);
  assert.notEqual((await login(a.email, a.password)).status, 200);
});
test("password reset revokes every old session and preserves Key/history ownership", async () => {
  const old = cookie;
  const result = await manageTestAccount(a.email, "reset-password");
  assert.ok(result.password); assert.notEqual(result.password, a.password);
  await assert.rejects(resolveRequestIdentity(req("/", old)), /过期/);
  assert.equal((await login(a.email, a.password)).status, 401);
  const response = await login(a.email, result.password!); assert.equal(response.status, 200); cookie = cookieOf(response);
  assert.equal((await loadCredential(a.userId)).key, "d".repeat(32));
});
test("old accounts without explicit beta qualification are rejected even with an existing valid session", async () => {
  const second = cookieOf(await login(b.email, b.password));
  const access = await resolveAmapAccess(req("/api/search", second), 1000);
  await prisma.user.update({ where: { id: b.userId }, data: { betaAccess: false } });
  await assert.rejects(resolveRequestIdentity(req("/", second)), /资格/);
  assert.notEqual((await login(b.email, b.password)).status, 200);
  await assert.rejects(access.options.beforeAttempt("nearby", new AbortController().signal));
  await prisma.user.update({ where: { id: b.userId }, data: { betaAccess: true } });
});
test("disabling denies login, existing sessions and admission already prepared before disabling", async () => {
  const access = await resolveAmapAccess(req("/api/search", cookie), 1000);
  await manageTestAccount(a.email, "disable");
  assert.ok((await prisma.user.findUniqueOrThrow({ where: { id: a.userId } })).disabledAt);
  assert.equal(await prisma.session.count({ where: { userId: a.userId } }), 0);
  await assert.rejects(resolveRequestIdentity(req("/", cookie)), /过期/);
  const reset = await manageTestAccount(a.email, "reset-password");
  assert.notEqual((await login(a.email, reset.password!)).status, 200);
  await assert.rejects(access.options.beforeAttempt("nearby", new AbortController().signal));
});
test("expiry and invalid/production-local configuration fail closed", async () => {
  const second = cookieOf(await login(b.email, b.password));
  await prisma.session.updateMany({ where: { userId: b.userId }, data: { expiresAt: new Date(0) } });
  await assert.rejects(resolveRequestIdentity(req("/", second)), /过期/);
  process.env.NEARBY_ACCESS_MODE = "typo"; assert.throws(accessMode);
  process.env.NEARBY_ACCESS_MODE = "local-beta";
  const environment = process.env as Record<string, string | undefined>;
  const prior = environment.NODE_ENV; environment.NODE_ENV = "production";
  try { assert.throws(accessMode); }
  finally { if (prior === undefined) delete environment.NODE_ENV; else environment.NODE_ENV = prior; }
});
