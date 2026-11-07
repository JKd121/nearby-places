import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { configureIdentityTest, resetIdentityDatabase } from "./identity-test-runtime.js";

process.env.NEARBY_IDENTITY_TEST_ACCESS_MODE = "local-beta";
const url = configureIdentityTest();
const { prisma, getAdmissionRuntime } = await import("../src/db/prisma.js");
const { createTestAccount } = await import("../src/identity/test-accounts.js");
const { getAuth } = await import("../src/identity/auth.js");
const { POST, GET } = await import("../app/api/auth/[...all]/route.js");
const { resolveRequestIdentity, startGuest, GUEST_ID_COOKIE, GUEST_SESSION_COOKIE } = await import("../src/identity/service.js");
const { GET: historyGet } = await import("../app/api/history/route.js");
const { GET: keyGet } = await import("../app/api/account/amap-credential/route.js");
const { saveCredential } = await import("../src/identity/credentials.js");
const pool = new Pool({ connectionString: url });
const origin = "http://localhost:3127";
type Account = Awaited<ReturnType<typeof createTestAccount>>;
let good: Account, disabled: Account, unqualified: Account, unverified: Account;
const req = (path: string, body?: unknown, cookie = "", extra: Record<string, string> = {}) => new Request(origin + path, {
  method: body === undefined ? "GET" : "POST", headers: { origin, cookie, "content-type": "application/json", ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const login = (email: string, password: string, path = "/api/auth/sign-in/email", cookie = "", extra: Record<string, string> = {}) => POST(req(path, { email, password }, cookie, extra));
const cookies = (r: Response) => r.headers.getSetCookie().map(v => v.split(";")[0]).join("; ");
const clear = () => prisma.requestCounter.deleteMany();
before(async () => {
  await resetIdentityDatabase(url);
  good = await createTestAccount("security-good@example.test"); disabled = await createTestAccount("security-disabled@example.test");
  unqualified = await createTestAccount("security-unqualified@example.test"); unverified = await createTestAccount("security-unverified@example.test");
  await prisma.user.updateMany({ where: { id: { in: [good.userId, disabled.userId, unqualified.userId] } }, data: { emailVerified: true } });
  await prisma.user.update({ where: { id: disabled.userId }, data: { disabledAt: new Date() } });
  await prisma.user.update({ where: { id: unqualified.userId }, data: { betaAccess: false } });
});
beforeEach(async () => { process.env.NEARBY_ACCESS_MODE = "local-beta"; delete process.env.VERCEL; await clear(); });
after(async () => { await pool.end(); await prisma.$disconnect(); await getAdmissionRuntime().pool.end(); });

for (const mode of ["verified", "local-beta", "private-beta"]) {
  test(`${mode}: successful login issues an owner-bound HttpOnly session and logout revokes it`, async () => {
    process.env.NEARBY_ACCESS_MODE = mode;
    const response = await login(good.email, good.password); assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const sessionCookie = response.headers.getSetCookie().find(v => v.includes("session_token="));
    assert.ok(sessionCookie); assert.match(sessionCookie, /HttpOnly/i); assert.match(sessionCookie, /SameSite=Lax/i);
    const cookie = cookies(response), identity = await resolveRequestIdentity(req("/", undefined, cookie));
    assert.equal(identity.kind, "account"); if (identity.kind === "account") assert.equal(identity.userId, good.userId);
    assert.equal((await historyGet(req("/api/history", undefined, cookie))).status, 200);
    assert.equal((await keyGet(req("/api/account/amap-credential", undefined, cookie))).status, 200);
    assert.equal((await POST(req("/api/auth/sign-out", {}, cookie))).status, 200);
    await assert.rejects(resolveRequestIdentity(req("/", undefined, cookie)));
    assert.equal((await keyGet(req("/api/account/amap-credential", undefined, cookie))).status, 401);
  });
  test(`${mode}: unknown account, wrong password and both wrong have identical failures and no session side effects`, async () => {
    process.env.NEARBY_ACCESS_MODE = mode;
    const before = await prisma.session.count(); const responses: unknown[] = [];
    for (const [email, password] of [[good.email, "WrongPassword!"], ["missing@example.test", good.password], ["other-missing@example.test", "WrongPassword!"]]) {
      await clear(); const response = await login(email!, password!);
      assert.equal(response.status, 401); assert.equal(response.headers.getSetCookie().length, 0);
      responses.push(await response.json()); assert.equal(await prisma.session.count(), before);
    }
    assert.deepEqual(responses[0], responses[1]); assert.deepEqual(responses[1], responses[2]);
    assert.deepEqual(responses[0], { code: "INVALID_EMAIL_OR_PASSWORD", message: "邮箱或密码有误" });
  });
  test(`${mode}: disabled and beta-ineligible users receive ordinary credential failures`, async () => {
    process.env.NEARBY_ACCESS_MODE = mode;
    const before = await prisma.session.count();
    for (const account of mode === "verified" ? [disabled] : [disabled, unqualified]) {
      await clear(); const r = await login(account.email, account.password);
      assert.equal(r.status, 401); assert.equal(r.headers.getSetCookie().length, 0);
      assert.deepEqual(await r.json(), { code: "INVALID_EMAIL_OR_PASSWORD", message: "邮箱或密码有误" });
    }
    assert.equal(await prisma.session.count(), before);
  });
  test(`${mode}: exact 3/10s limit, sustained rejection and database-clock recovery`, async () => {
    process.env.NEARBY_ACCESS_MODE = mode;
    const before = await prisma.session.count();
    for (let i = 0; i < 3; i++) assert.equal((await login(good.email, "WrongPassword!")).status, 401);
    const blocked = await login(good.email, good.password); assert.equal(blocked.status, 429);
    const retry = Number(blocked.headers.get("retry-after")); assert.ok(Number.isInteger(retry) && retry >= 1 && retry <= 10);
    assert.equal(blocked.headers.getSetCookie().length, 0);
    assert.equal((await login("missing@example.test", "WrongPassword!")).status, 429);
    assert.equal(await prisma.session.count(), before);
    await prisma.requestCounter.updateMany({ data: { resetsAt: new Date(0) } });
    assert.equal((await login(good.email, good.password)).status, 200);
  });
  test(`${mode}: concurrent HTTP attempts share the atomic limiter`, async () => {
    process.env.NEARBY_ACCESS_MODE = mode;
    const results = await Promise.all(Array.from({ length: 8 }, () => login(good.email, "WrongPassword!")));
    assert.equal(results.filter(r => r.status === 401).length, 3); assert.equal(results.filter(r => r.status === 429).length, 5);
    assert.ok(results.every(r => r.headers.getSetCookie().length === 0));
  });
}
test("unknown users execute the library's dummy hash path instead of a fast rejection", async () => {
  const context = await getAuth().$context, original = context.password.hash; let hashes = 0;
  context.password.hash = async password => { hashes++; return original(password); };
  try { assert.equal((await login("hash-path-missing@example.test", "WrongPassword!")).status, 401); assert.equal(hashes, 1); }
  finally { context.password.hash = original; }
});
test("verified mode preserves email-verification errors after a correct password", async () => {
  process.env.NEARBY_ACCESS_MODE = "verified";
  const before = await prisma.session.count(); const r = await login(unverified.email, unverified.password);
  assert.equal(r.status, 403); assert.equal((await r.json()).code, "EMAIL_NOT_VERIFIED"); assert.equal(r.headers.getSetCookie().length, 0);
  assert.equal(await prisma.session.count(), before);
});
test("failed account login preserves the guest session and identity cookie", async () => {
  const guest = await startGuest(req("/api/guest/session", {}));
  const cookie = `${GUEST_ID_COOKIE}=${guest.identity}; ${GUEST_SESSION_COOKIE}=${guest.session}`;
  const r = await login(good.email, "WrongPassword!", undefined, cookie);
  assert.equal(r.status, 401); assert.equal(r.headers.getSetCookie().length, 0);
  assert.equal((await resolveRequestIdentity(req("/", undefined, cookie))).kind, "guest");
});
test("canonical and trailing-slash/query login paths revoke guest sessions identically", async () => {
  for (const path of ["/api/auth/sign-in/email", "/api/auth/sign-in/email/", "/api/auth/sign-in/email?from=security"]) {
    await clear(); const guest = await startGuest(req("/api/guest/session", {}));
    const cookie = `${GUEST_ID_COOKIE}=${guest.identity}; ${GUEST_SESSION_COOKIE}=${guest.session}`;
    const r = await login(good.email, good.password, path, cookie); assert.equal(r.status, 200, path);
    assert.equal(await prisma.guestSession.count({ where: { id: guest.session } }), 0, path);
    assert.ok(r.headers.getSetCookie().some(v => v.startsWith(`${GUEST_SESSION_COOKIE}=`) && v.includes("Max-Age=0")));
  }
});
test("path aliases cannot create a new limit bucket and ambiguous encodings are rejected", async () => {
  for (const path of ["/api/auth/sign-in/email", "/api/auth/sign-in/email/", "/api/auth/sign-in/email?x=1"]) assert.equal((await login(good.email, "WrongPassword!", path)).status, 401);
  assert.equal((await login(good.email, "WrongPassword!", "/api/auth/sign-in/email/?x=2")).status, 429);
  for (const path of ["/api/auth/sign-in%2femail", "/api/auth//sign-in/email", "/api/auth/sign-in/email//"]) {
    const r = await login(good.email, good.password, path); assert.ok([400, 403, 404].includes(r.status), path);
  }
});
test("guest cleanup failure returns a retryable error and compensates the new account session", async () => {
  const guest = await startGuest(req("/api/guest/session", {})), before = await prisma.session.count();
  const cookie = `${GUEST_ID_COOKIE}=${guest.identity}; ${GUEST_SESSION_COOKIE}=${guest.session}`;
  await pool.query('ALTER TABLE "GuestSession" RENAME TO "__security_guest_unavailable"');
  try {
    const r = await login(good.email, good.password, undefined, cookie); assert.equal(r.status, 503);
    assert.equal(r.headers.getSetCookie().length, 0); assert.equal(await prisma.session.count(), before);
    assert.equal((await r.json()).error.code, "AUTH_SERVICE_UNAVAILABLE");
  } finally { await pool.query('ALTER TABLE "__security_guest_unavailable" RENAME TO "GuestSession"'); }
  const counters = await prisma.requestCounter.findMany({ where: { key: { startsWith: "auth:" } } });
  assert.equal(counters.reduce((sum, counter) => sum + counter.count, 0), 1);
  assert.equal((await resolveRequestIdentity(req("/", undefined, cookie))).kind, "guest");
});
test("unavailable rate storage fails closed before creating a session", async () => {
  const before = await prisma.session.count(); await pool.query('ALTER TABLE "RequestCounter" RENAME TO "__security_counter_unavailable"');
  try {
    const r = await login(good.email, good.password); assert.equal(r.status, 503);
    assert.equal(r.headers.getSetCookie().length, 0); assert.equal(await prisma.session.count(), before);
  } finally { await pool.query('ALTER TABLE "__security_counter_unavailable" RENAME TO "RequestCounter"'); }
});
test("cancellation inside the common auth handler rolls back durable login state before commit", async () => {
  const guest = await startGuest(req("/api/guest/session", {}));
  const cookie = `${GUEST_ID_COOKIE}=${guest.identity}; ${GUEST_SESSION_COOKIE}=${guest.session}`;
  const controller = new AbortController(), context = await getAuth().$context, original = context.password.verify;
  const before = await prisma.session.count();
  context.password.verify = async value => { const valid = await original(value); controller.abort(); return valid; };
  try {
    // GET exports the common handler; invoke it directly so this assertion awaits transaction rollback,
    // rather than the outer POST lifecycle returning early while cancellation drains in the background.
    const request = new Request(origin + "/api/auth/sign-in/email", { method: "POST", signal: controller.signal, headers: { origin, cookie, "content-type": "application/json" }, body: JSON.stringify({ email: good.email, password: good.password }) });
    const r = await GET(request); assert.equal(r.status, 503); assert.equal(r.headers.getSetCookie().length, 0);
    assert.equal(await prisma.session.count(), before); assert.equal(await prisma.guestSession.count({ where: { id: guest.session } }), 1);
  } finally { context.password.verify = original; }
});
test("generic forwarded headers cannot bypass the local shared source bucket", async () => {
  for (let i = 1; i <= 3; i++) assert.equal((await login(good.email, "WrongPassword!", undefined, "", { "x-forwarded-for": `192.0.2.${i}`, "x-real-ip": `198.51.100.${i}` })).status, 401);
  assert.equal((await login(good.email, good.password, undefined, "", { "x-forwarded-for": "192.0.2.99" })).status, 429);
});
test("wrong origin is rejected without a credential check or new session", async () => {
  const before = await prisma.session.count();
  const r = await login(good.email, good.password, undefined, "", { origin: "https://untrusted.example" });
  assert.equal(r.status, 403); assert.equal(r.headers.getSetCookie().length, 0); assert.equal(await prisma.session.count(), before);
});
test("Vercel login rejects missing, malformed and chained source addresses without issuing a session", async () => {
  process.env.VERCEL = "1"; process.env.NEARBY_ACCESS_MODE = "private-beta";
  const before = await prisma.session.count();
  for (const ip of [undefined, "not-an-ip", "192.0.2.1, 192.0.2.2", "192.0.2.1 "]) {
    const headers: Record<string, string> = ip === undefined ? {} : { "x-vercel-forwarded-for": ip };
    const r = await login(good.email, good.password, undefined, "", headers);
    // Fetch trims outer header whitespace, so a trimmed valid address is valid.
    assert.equal(r.status, ip === "192.0.2.1 " ? 200 : 503);
    if (r.status !== 200) assert.equal(r.headers.getSetCookie().length, 0);
  }
  assert.equal(await prisma.session.count(), before + 1);
});
test("trusted Vercel clients have independent buckets while spoofed generic headers have no effect", async () => {
  process.env.VERCEL = "1"; process.env.NEARBY_ACCESS_MODE = "private-beta";
  for (let i = 0; i < 3; i++) assert.equal((await login(good.email, "WrongPassword!", undefined, "", { "x-vercel-forwarded-for": "192.0.2.10", "x-forwarded-for": `198.51.100.${i}` })).status, 401);
  assert.equal((await login(good.email, good.password, undefined, "", { "x-vercel-forwarded-for": "192.0.2.10", "x-real-ip": "198.51.100.80" })).status, 429);
  assert.equal((await login(good.email, good.password, undefined, "", { "x-vercel-forwarded-for": "192.0.2.11" })).status, 200);
});
test("the library normalizes IPv6 and IPv4-mapped representations into shared source buckets", async () => {
  process.env.VERCEL = "1"; process.env.NEARBY_ACCESS_MODE = "private-beta";
  for (const ip of ["2001:db8::1", "2001:0db8:0000:0000:0000:0000:0000:0001", "2001:db8::abcd"]) {
    assert.equal((await login(good.email, "WrongPassword!", undefined, "", { "x-vercel-forwarded-for": ip })).status, 401);
  }
  assert.equal((await login(good.email, good.password, undefined, "", { "x-vercel-forwarded-for": "2001:db8::2" })).status, 429);
  await clear();
  for (const ip of ["192.0.2.8", "::ffff:192.0.2.8", "::ffff:c000:0208"]) assert.equal((await login(good.email, "WrongPassword!", undefined, "", { "x-vercel-forwarded-for": ip })).status, 401);
  assert.equal((await login(good.email, good.password, undefined, "", { "x-vercel-forwarded-for": "192.0.2.8" })).status, 429);
});
test("tampered cookies, expiry and mismatched browser session markers cannot access account resources", async () => {
  await saveCredential(good.userId, "a".repeat(32));
  const response = await login(good.email, good.password), cookie = cookies(response);
  const identity = await resolveRequestIdentity(req("/", undefined, cookie));
  const stale = req("/api/account/amap-credential", undefined, cookie, { "x-nearby-session": "other-account-session" });
  assert.equal((await keyGet(stale)).status, 409);
  const forged = cookie.replace(/(session_token=)[^;]+/, "$1forged-token.invalid-signature");
  assert.equal((await keyGet(req("/api/account/amap-credential", undefined, forged))).status, 401);
  await prisma.session.update({ where: { id: identity.sessionId }, data: { expiresAt: new Date(0) } });
  assert.equal((await keyGet(req("/api/account/amap-credential", undefined, cookie))).status, 401);
  assert.equal((await historyGet(req("/api/history", undefined, cookie))).status, 401);
});
test("separate HTTP worker processes share one login rate bucket", async () => {
  const worker = () => new Promise<number[]>((done, fail) => {
    const p = spawn(process.execPath, ["--import", "tsx", "--conditions=react-server", "test/login-security-worker.ts"], { env: { ...process.env, NEARBY_IDENTITY_TEST_ACCESS_MODE: "local-beta" }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let output = ""; p.stdout.on("data", chunk => { output += chunk; }); p.on("error", fail); p.on("exit", code => code === 0 ? done(JSON.parse(output)) : fail(new Error("HTTP worker failed")));
  });
  const statuses = (await Promise.all([worker(), worker()])).flat();
  assert.equal(statuses.filter(s => s === 401).length, 3); assert.equal(statuses.filter(s => s === 429).length, 5);
});
test("production HTTPS login sets Secure, HttpOnly and SameSite cookies", async () => {
  const result = await new Promise<{ status: number; secure: boolean; httpOnly: boolean; sameSite: boolean }>((done, fail) => {
    const p = spawn(process.execPath, ["--import", "tsx", "--conditions=react-server", "test/login-security-worker.ts"], {
      env: { ...process.env, NODE_ENV: "production", VERCEL: "1", NEARBY_IDENTITY_TEST_ACCESS_MODE: "private-beta", LOGIN_WORKER_ACTION: "secure-cookie", LOGIN_WORKER_EMAIL: good.email, LOGIN_WORKER_PASSWORD: good.password }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    });
    let output = ""; p.stdout.on("data", chunk => { output += chunk; }); p.on("error", fail); p.on("exit", code => code === 0 ? done(JSON.parse(output)) : fail(new Error("Production cookie worker failed")));
  });
  assert.deepEqual(result, { status: 200, secure: true, httpOnly: true, sameSite: true });
});
