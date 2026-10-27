import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { createAdmission, PostgresAdmissionStore, type AdmissionDatabase, type AdmissionSql } from "../src/admission/service.js";
import { createRequestContext, cancellableDelay } from "../src/amap/request-context.js";
import { createAmapTransport } from "../src/amap/transport.js";
import { AmapApiError } from "../src/amap/errors.js";

const connectionString = process.env.NEARBY_ADMISSION_TEST_DATABASE_URL;
if (!connectionString) throw Error("Set NEARBY_ADMISSION_TEST_DATABASE_URL to a disposable loopback database");
const target = new URL(connectionString);
if (target.hostname !== "127.0.0.1" || !target.pathname.startsWith("/nearby_admission_test")) throw Error("Refusing non-test database");
const pool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 200 });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 4, connectionTimeoutMillis: 200, statement_timeout: 800, lock_timeout: 150, idle_in_transaction_session_timeout: 800 }) });
const store = new PostgresAdmissionStore(db);
const signal = new AbortController().signal;
const remaining = () => 2000;
const code = (name: string) => (e: unknown) => e instanceof AmapApiError && e.code === name;
before(async () => {
  // This explicit test command owns the whole disposable DB; no application URLs are read.
  await pool.query('DROP TABLE IF EXISTS "AmapOperationBinding", "AmapResource", "AdmissionAudit" CASCADE; DROP FUNCTION IF EXISTS amap_admission_policy_change() CASCADE;');
  await pool.query(await readFile(new URL("../../prisma/migrations/20261027000000_amap_admission/migration.sql", import.meta.url), "utf8").catch(() => readFile("prisma/migrations/20261027000000_amap_admission/migration.sql", "utf8")));
  await pool.query(`CREATE TABLE "AdmissionAudit" (at timestamptz NOT NULL);
    CREATE OR REPLACE FUNCTION admission_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW."dayUsed" <> OLD."dayUsed" OR NEW."monthUsed" <> OLD."monthUsed" THEN
        INSERT INTO "AdmissionAudit" VALUES (NEW."nextGrantAt" - NEW."intervalMs" * interval '1 millisecond');
      END IF; RETURN NEW; END; $$;
    CREATE TRIGGER admission_audit AFTER UPDATE ON "AmapResource" FOR EACH ROW EXECUTE FUNCTION admission_audit();`);
});
after(async () => { await db.$disconnect(); await pool.end(); });
async function seed(daily = 100, monthly = 100, interval = 500) {
  await pool.query('TRUNCATE "AmapOperationBinding", "AmapResource", "AdmissionAudit"');
  await pool.query(`INSERT INTO "AmapResource" (id,enabled,"dailyLimit","monthlyLimit","intervalMs","graceMs","permitTtlMs") VALUES ('shared',true,$1,$2,$3,600,400)`, [daily, monthly, interval]);
  for (const op of ["geocode", "poi-text", "nearby"]) await pool.query('INSERT INTO "AmapOperationBinding" VALUES ($1,$2,$3)', ["test", op, "shared"]);
}
async function state() { return (await pool.query('SELECT * FROM "AmapResource" WHERE id=$1', ["shared"])).rows[0]; }
function simulated() {
  let sends = 0;
  const transport = createAmapTransport(async () => { sends++; return Response.json({ status: "1" }); }, { beforeAttempt: createAdmission(store, "test") });
  return { transport, sends: () => sends, run: () => transport.requestJson(new URL("https://restapi.amap.com/v3/geocode/geo?key=fake"), "geocode") };
}

test("actual PostgreSQL: concurrent tickets are unique and reservation spends no budget", async () => {
  await seed();
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => store.reserve("test", "geocode", signal, remaining)));
  const tickets = results.flatMap(r => r.status === "fulfilled" ? [r.value] : []);
  assert.ok(tickets.length >= 3 && tickets.length <= 5);
  assert.equal(new Set(tickets.map(t => +t.scheduledAt)).size, tickets.length);
  assert.equal((await state()).dayUsed, 0);
});

test("actual PostgreSQL: three concurrent requests; grants are separated, no HTTP quota used", async () => {
  await seed(); const mock = simulated();
  const results = await Promise.allSettled(Array.from({ length: 3 }, () => mock.run()));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 3, JSON.stringify(results));
  assert.equal(mock.sends(), 3);
  const times = (await pool.query('SELECT at FROM "AdmissionAudit" ORDER BY at')).rows.map(r => +r.at);
  for (let i = 1; i < times.length; i++) assert.ok(times[i]! - times[i - 1]! >= 500);
  assert.equal((await state()).dayUsed, 3); assert.equal((await state()).monthUsed, 3);
});

test("actual PostgreSQL: last day/month unit and replay are atomic", async () => {
  for (const [daily, monthly, expected] of [[1, 10, "DAILY_BUDGET_EXHAUSTED"], [10, 1, "MONTHLY_BUDGET_EXHAUSTED"]] as const) {
    await seed(daily, monthly, 20);
    const mock = simulated();
    const results = await Promise.allSettled(Array.from({ length: 3 }, () => mock.run()));
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.ok(results.some(r => r.status === "rejected" && code(expected)(r.reason)));
    const row = await state(); assert.equal(row.dayUsed, 1); assert.equal(row.monthUsed, 1); assert.equal(row.enabled, true);
  }
  await seed(10, 10, 1);
  const ticket = await store.reserve("test", "geocode", signal, remaining);
  await store.grant("test", "geocode", ticket, signal, remaining);
  await assert.rejects(store.grant("test", "geocode", ticket, signal, remaining), code("ADMISSION_WAIT_EXCEEDED"));
  assert.equal((await state()).dayUsed, 1);
});

test("actual PostgreSQL: lazy calendar rollover reopens without enabling/disabling", async () => {
  await seed(1, 1, 1);
  await pool.query(`UPDATE "AmapResource" SET day='2000-01-01',month='2000-01',"dayUsed"=1,"monthUsed"=1`);
  const mock = simulated(); await mock.run(); assert.equal(mock.sends(), 1);
  assert.equal((await state()).dayUsed, 1); assert.notEqual((await state()).month, "2000-01");
});

test("actual PostgreSQL: policy changes invalidate tickets and preserve rate barrier", async () => {
  await seed(); const ticket = await store.reserve("test", "geocode", signal, remaining);
  await pool.query('UPDATE "AmapResource" SET "intervalMs"=1000');
  await assert.rejects(store.grant("test", "geocode", ticket, signal, remaining), code("ADMISSION_UNAVAILABLE"));
  assert.equal((await state()).policyVersion, 2); assert.ok(+(await state()).nextGrantAt > Date.now());
  assert.equal((await state()).dayUsed, 0);
});

test("actual PostgreSQL: cancel during waiting or a held row lock cannot send", async () => {
  await seed(); await store.reserve("test", "geocode", signal, remaining);
  const parent = new AbortController(); const context = createRequestContext(parent.signal); let sends = 0;
  const transport = createAmapTransport(async () => { sends++; return Response.json({ status: "1" }); }, { context, beforeAttempt: createAdmission(store, "test") });
  const pending = transport.requestJson(new URL("https://restapi.amap.com/v3/geocode/geo?key=fake"), "geocode");
  await cancellableDelay(30); parent.abort(); await assert.rejects(pending); await cancellableDelay(50);
  assert.equal(sends, 0); assert.equal((await state()).dayUsed, 0); context.dispose();
  const blocker = await pool.connect();
  try {
    await blocker.query('BEGIN'); await blocker.query('SELECT * FROM "AmapResource" FOR UPDATE');
    const mock = simulated(), start = performance.now();
    await assert.rejects(mock.run(), code("ADMISSION_UNAVAILABLE"));
    assert.ok(performance.now() - start < 1200); assert.equal(mock.sends(), 0);
  } finally { await blocker.query('ROLLBACK'); blocker.release(); }
});

test("actual PostgreSQL: independent processes share rate state", async () => {
  await seed();
  const worker = () => new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, ["--conditions=react-server", "test/admission-worker.mjs", connectionString!, "1"], { windowsHide: true });
    let stdout = "", stderr = ""; child.stdout.on("data", b => { stdout += b; }); child.stderr.on("data", b => { stderr += b; });
    child.on("error", reject); child.on("exit", exit => exit === 0 ? resolve(stdout) : reject(Error(`worker failed: ${stderr}`)));
  });
  const results = await Promise.all([worker(), worker()]);
  assert.equal(results.flatMap(r => JSON.parse(r)).filter(r => r.sentAt).length, 2);
  const times = (await pool.query('SELECT at FROM "AdmissionAudit" ORDER BY at')).rows.map(r => +r.at);
  assert.equal(times.length, 2); assert.ok(times[1]! - times[0]! >= 500);
});

test("actual PostgreSQL: lost COMMIT acknowledgement burns one unit but sends nothing", async () => {
  await seed(10, 10, 1); let transactions = 0, sends = 0;
  const ambiguous: AdmissionDatabase = { async $transaction(run, options) {
    const result = await db.$transaction(run, options);
    if (++transactions === 2) throw Error("simulated lost commit acknowledgement");
    return result;
  } };
  const transport = createAmapTransport(async () => { sends++; return Response.json({ status: "1" }); }, { beforeAttempt: createAdmission(new PostgresAdmissionStore(ambiguous), "test") });
  await assert.rejects(transport.requestJson(new URL("https://restapi.amap.com/v3/geocode/geo?key=fake"), "geocode"), code("ADMISSION_UNAVAILABLE"));
  assert.equal(transactions, 2); assert.equal(sends, 0); assert.equal((await state()).dayUsed, 1); assert.equal((await state()).monthUsed, 1);
});

test("actual PostgreSQL: cancellation at budget UPDATE rolls back, cancellation after COMMIT does not refund", async () => {
  for (const phase of ["update", "commit"] as const) {
    await seed(10, 10, 1); const parent = new AbortController(); let transactions = 0, sends = 0;
    const fault: AdmissionDatabase = { async $transaction(run, options) {
      const number = ++transactions;
      const result = await db.$transaction(async tx => run({ async $queryRawUnsafe<T>(sql: string, ...values: unknown[]) {
        const value = await tx.$queryRawUnsafe<T>(sql, ...values);
        if (number === 2 && phase === "update" && sql.includes('SET day=')) parent.abort();
        return value;
      } } satisfies AdmissionSql), options);
      if (number === 2 && phase === "commit") parent.abort();
      return result;
    } };
    const context = createRequestContext(parent.signal);
    const transport = createAmapTransport(async () => { sends++; return Response.json({ status: "1" }); }, { context, beforeAttempt: createAdmission(new PostgresAdmissionStore(fault), "test") });
    await assert.rejects(transport.requestJson(new URL("https://restapi.amap.com/v3/geocode/geo?key=fake"), "geocode"));
    await cancellableDelay(30);
    assert.equal(sends, 0); assert.equal((await state()).dayUsed, phase === "update" ? 0 : 1); context.dispose();
  }
});

test("actual PostgreSQL: expired tickets, disabled scopes and unauthorized operations fail closed", async () => {
  await seed(); const ticket = await store.reserve("test", "geocode", signal, remaining);
  await cancellableDelay(650);
  await assert.rejects(store.grant("test", "geocode", ticket, signal, remaining), code("ADMISSION_WAIT_EXCEEDED"));
  await assert.rejects(store.reserve("unknown", "geocode", signal, remaining), code("ADMISSION_UNAVAILABLE"));
  await pool.query('UPDATE "AmapResource" SET enabled=false');
  await assert.rejects(store.reserve("test", "geocode", signal, remaining), code("ADMISSION_UNAVAILABLE"));
  assert.equal((await state()).dayUsed, 0);
});

test("actual PostgreSQL: pool acquire queue times out rather than accumulating forever", async () => {
  await seed();
  const smallPool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 100, statement_timeout: 200, lock_timeout: 100, idle_in_transaction_session_timeout: 300 });
  const client = new PrismaClient({ adapter: new PrismaPg(smallPool) });
  const held = await smallPool.connect(); const start = performance.now();
  try {
    await assert.rejects(new PostgresAdmissionStore(client).reserve("test", "geocode", signal, remaining), code("ADMISSION_UNAVAILABLE"));
    assert.ok(performance.now() - start < 1000); assert.equal(smallPool.waitingCount, 0);
  } finally { held.release(); await client.$disconnect(); await smallPool.end(); }
});

test("actual PostgreSQL: server statement timeout terminates SQL, not only its JS waiter", async () => {
  const start = performance.now();
  await assert.rejects(db.$transaction(async tx => {
    await tx.$queryRawUnsafe("SELECT set_config('statement_timeout', '80', true)");
    await tx.$queryRawUnsafe("SELECT pg_sleep(5)");
  }, { timeout: 800, maxWait: 200 }));
  assert.ok(performance.now() - start < 1000);
  const rows = await pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE state='active' AND query='SELECT pg_sleep(5)'");
  assert.equal(rows.rows[0].n, 0);
});

test("actual PostgreSQL: real server factories and all three routes enforce the shared pool", async () => {
  await seed(3, 10, 20);
  const saved = { database: process.env.DATABASE_URL, key: process.env.AMAP_WEB_SERVICE_KEY, credential: process.env.AMAP_CREDENTIAL_ID };
  const original = globalThis.fetch;
  process.env.DATABASE_URL = connectionString; process.env.AMAP_WEB_SERVICE_KEY = "test-only"; process.env.AMAP_CREDENTIAL_ID = "test";
  let sends = 0;
  globalThis.fetch = async () => { sends++; return Response.json({ status: "1", pois: [] }); };
  try {
    const { POST: resolve } = await import("../app/api/resolve-location/route.js");
    const { POST: search } = await import("../app/api/search/route.js");
    const { POST: page } = await import("../app/api/search/page/route.js");
    const centre = { query: "fixture", formattedAddress: "fixture", province: null, city: null, district: null, level: null, longitude: 114, latitude: 22 };
    const request = (body: unknown) => new Request("http://localhost/", { method: "POST", body: JSON.stringify(body) });
    assert.equal((await resolve(request({ query: "fixture" }))).status, 200);
    assert.equal((await search(request({ center: centre, resolvedLocation: centre, categoryIds: ["hotel"], radiusMeters: 3000 }))).status, 200);
    assert.equal((await page(request({ center: centre, categoryId: "hotel", radiusMeters: 3000 }))).status, 200);
    const refusal = await resolve(request({ query: "fixture" }));
    assert.equal(refusal.status, 429); assert.equal((await refusal.json()).error.code, "DAILY_BUDGET_EXHAUSTED");
    assert.equal(sends, 3); assert.equal((await state()).dayUsed, 3);
  } finally {
    globalThis.fetch = original;
    const { getAdmissionPrisma, prisma } = await import("../src/db/prisma.js");
    await getAdmissionPrisma().$disconnect(); await prisma.$disconnect();
    for (const [name, value] of [["DATABASE_URL", saved.database], ["AMAP_WEB_SERVICE_KEY", saved.key], ["AMAP_CREDENTIAL_ID", saved.credential]] as const)
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});
