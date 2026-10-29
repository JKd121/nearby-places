import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer, connect as connectSocket, type Socket } from "node:net";
import { Pool } from "pg";
import { PipelinedAdmissionDatabase, type AdmissionExecution, type AdmissionPool, type AdmissionDiagnostic } from "../src/admission/database.js";
import { budgetPeriod, createAdmission, PostgresAdmissionStore, type AdmissionDatabase } from "../src/admission/service.js";
import { createRequestContext, cancellableDelay } from "../src/amap/request-context.js";
import { AdmissionError } from "../src/admission/errors.js";
import { createAmapTransport } from "../src/amap/transport.js";
import { AmapApiError } from "../src/amap/errors.js";
import { CATEGORIES } from "../src/amap/categories.js";
import { createAmapClientWithTransport } from "../src/amap/client.js";
import { executeResolvedSearch } from "../src/search/service.js";

const connectionString = process.env.NEARBY_ADMISSION_TEST_DATABASE_URL;
if (!connectionString) throw Error("Set NEARBY_ADMISSION_TEST_DATABASE_URL to a disposable loopback database");
const target = new URL(connectionString);
if (target.hostname !== "127.0.0.1" || !target.pathname.startsWith("/nearby_admission_test")) throw Error("Refusing non-test database");
const pool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 200 });
const admissionPool = new Pool({ connectionString, pipeline: true, max: 4, connectionTimeoutMillis: 200 });
const db = new PipelinedAdmissionDatabase(admissionPool);
const store = new PostgresAdmissionStore(db);
const signal = new AbortController().signal;
const remaining = () => 2000;
const code = (name: string) => (e: unknown) => e instanceof AmapApiError && e.code === name;
before(async () => {
  // This explicit test command owns the whole disposable DB; no application URLs are read.
  await pool.query('DROP TABLE IF EXISTS "AmapOperationBinding", "AmapResource", "AdmissionAudit" CASCADE; DROP FUNCTION IF EXISTS amap_admission_policy_change() CASCADE; DROP FUNCTION IF EXISTS public.amap_admission_reserve_v1(text,text,integer); DROP FUNCTION IF EXISTS public.amap_admission_grant_v1(text,text,text,integer,bigint,bigint,integer);');
  await pool.query(await readFile(new URL("../../prisma/migrations/20261027000000_amap_admission/migration.sql", import.meta.url), "utf8").catch(() => readFile("prisma/migrations/20261027000000_amap_admission/migration.sql", "utf8")));
  await pool.query(await readFile("prisma/migrations/20261028000000_amap_admission_functions/migration.sql", "utf8"));
  await pool.query(await readFile("prisma/migrations/20261029000000_amap_admission_slot_alignment/migration.sql", "utf8"));
  await pool.query(`CREATE TABLE "AdmissionAudit" (at timestamptz NOT NULL);
    CREATE OR REPLACE FUNCTION admission_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW."dayUsed" <> OLD."dayUsed" OR NEW."monthUsed" <> OLD."monthUsed" THEN
        INSERT INTO "AdmissionAudit" VALUES (NEW."nextGrantAt" - NEW."intervalMs" * interval '1 millisecond');
      END IF; RETURN NEW; END; $$;
    CREATE TRIGGER admission_audit AFTER UPDATE ON "AmapResource" FOR EACH ROW EXECUTE FUNCTION admission_audit();`);
});
after(async () => { await admissionPool.end(); await pool.end(); });
async function seed(daily = 100, monthly = 100, interval = 500) {
  await pool.query('TRUNCATE "AmapOperationBinding", "AmapResource", "AdmissionAudit"');
  await pool.query(`INSERT INTO "AmapResource" (id,enabled,"dailyLimit","monthlyLimit","intervalMs","graceMs","permitTtlMs") VALUES ('shared',true,$1,$2,$3,600,400)`, [daily, monthly, interval]);
  for (const op of ["geocode", "poi-text", "nearby"]) await pool.query('INSERT INTO "AmapOperationBinding" VALUES ($1,$2,$3)', ["test", op, "shared"]);
}
async function state() { return (await pool.query('SELECT * FROM "AmapResource" WHERE id=$1', ["shared"])).rows[0]; }
async function seedHalf() {
  await pool.query('TRUNCATE "AmapOperationBinding", "AmapResource", "AdmissionAudit"');
  await pool.query(await readFile("scripts/initialize-amap-admission.sql", "utf8"));
  // A second logical credential is confined to the disposable database.
  await pool.query(`INSERT INTO "AmapOperationBinding" VALUES ('test','poi-text','amap-search'),('test','nearby','amap-search'),('test','geocode','amap-lbs')`);
}
async function stateFor(id: string) { return (await pool.query('SELECT * FROM "AmapResource" WHERE id=$1', [id])).rows[0]; }
function simulated() {
  let sends = 0;
  const transport = createAmapTransport(async () => { sends++; return Response.json({ status: "1" }); }, { beforeAttempt: createAdmission(store, "test") });
  return { transport, sends: () => sends, run: () => transport.requestJson(new URL("https://restapi.amap.com/v3/geocode/geo?key=fake"), "geocode") };
}

test("actual PostgreSQL: ten sequential categories tolerate 300ms TCP round trips", { timeout: 30000 }, async () => {
  await seedHalf();
  await withTcpLatency(async delayedDb => {
    let sends = 0; const phases: unknown[] = [];
    const delayed: AdmissionDatabase = { async execute(...args) {
      const result = await delayedDb.execute(...args); const row = result.value as { code?: string; validForMs?: number; delayMs?: number };
      phases.push({ code: row.code, validForMs: row.validForMs, delayMs: row.delayMs, ...result.diagnostic }); return result;
    } };
    const transport = createAmapTransport(async () => { sends++; return Response.json({ status: "1", count: "0", pois: [] }); }, { beforeAttempt: createAdmission(new PostgresAdmissionStore(delayed), "test") });
    const client = createAmapClientWithTransport("fake", transport);
    const center = { query: "test", formattedAddress: "test", province: "", city: "", district: "", longitude: 114, latitude: 22, level: "" };
    const result = await executeResolvedSearch({ center, resolvedLocation: center, categoryIds: CATEGORIES.map(c => c.key), radiusMeters: 3000 }, client, { concurrency: 1 });
    assert.equal(result.categories.length, 10); assert.equal(sends, 10, JSON.stringify(phases));
    assert.equal((await stateFor("amap-search")).dayUsed, 210);
  });
});

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

test("actual PostgreSQL: day and month roll independently and exhaustion returns Shanghai reset times", async () => {
  await seed(10, 10, 1);
  const period = budgetPeriod(new Date());
  await pool.query(`UPDATE "AmapResource" SET day='1900-01-01',month=$1,"dayUsed"=10,"monthUsed"=5`, [period.month]);
  await simulated().run(); assert.equal((await state()).dayUsed, 1); assert.equal((await state()).monthUsed, 6);
  await pool.query(`UPDATE "AmapResource" SET day=$1,month='1900-01',"dayUsed"=5,"monthUsed"=10`, [period.day]);
  await simulated().run(); assert.equal((await state()).dayUsed, 6); assert.equal((await state()).monthUsed, 1);
  for (const [daily, monthly, expected, retry] of [[1, 10, "DAILY_BUDGET_EXHAUSTED", period.nextDay], [10, 1, "MONTHLY_BUDGET_EXHAUSTED", period.nextMonth]] as const) {
    await seed(daily, monthly, 1); await simulated().run();
    await assert.rejects(simulated().run(), (e: unknown) => e instanceof AmapApiError && e.code === expected && (e as { retryAt?: string }).retryAt === retry);
  }
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

test("actual PostgreSQL: half-used search and LBS pools keep operation counts separate", async () => {
  await seedHalf();
  const admission = createAdmission(store, "test");
  const transport = createAmapTransport(async () => Response.json({ status: "1" }), { beforeAttempt: admission });
  await transport.requestJson(new URL("https://restapi.amap.com/v5/place/text?key=fake"), "poi-text");
  await transport.requestJson(new URL("https://restapi.amap.com/v5/place/around?key=fake"), "nearby");
  await transport.requestJson(new URL("https://restapi.amap.com/v3/geocode/geo?key=fake"), "geocode");
  const search = await stateFor("amap-search"), lbs = await stateFor("amap-lbs");
  assert.equal(search.dayUsed, 202); assert.equal(search.monthUsed, 2502);
  assert.equal(lbs.dayUsed, 501); assert.equal(lbs.monthUsed, 75001);
});

for (const zone of ["UTC", "Asia/Shanghai"] as const) test(`actual PostgreSQL: ${zone} session preserves the Shanghai day and absolute rate timestamps`, async () => {
  await seedHalf();
  const zonePool = new Pool({ connectionString, pipeline: true, options: `-c TimeZone=${zone}`, max: 2, connectionTimeoutMillis: 200 });
  try {
    const repository = new PostgresAdmissionStore(new PipelinedAdmissionDatabase(zonePool));
    const ticket = await repository.reserve("test", "nearby", signal, remaining);
    assert.ok(Math.abs(ticket.scheduledAt.getTime() - Date.now()) < 2000);
    const grant = await repository.grant("test", "nearby", ticket, signal, remaining);
    assert.ok(grant.validForMs !== undefined);
    const search = await stateFor("amap-search");
    assert.equal(search.dayUsed, 201); assert.equal(search.monthUsed, 2501);
    // A timezone shift must not schedule the next permit eight hours away.
    const delta = search.nextGrantAt.getTime() - Date.now();
    assert.ok(delta > 0 && delta <= 800, `next permit delta ${delta}ms`);
  } finally { await zonePool.end(); }
});

test("actual PostgreSQL: three preconnected processes start together on half-used search pool", async () => {
  await seedHalf();
  const workers = Array.from({ length: 3 }, () => {
    const child = spawn(process.execPath, ["--conditions=react-server", "test/admission-worker.mjs", connectionString!, "1", "barrier", "nearby"], { windowsHide: true });
    let stdout = "", stderr = "";
    const ready = new Promise<void>((resolve, reject) => {
      child.stdout.on("data", b => { stdout += b.toString(); if (stdout.includes("READY\n")) resolve(); });
      child.stderr.on("data", b => { stderr += b.toString(); });
      child.on("error", reject);
      child.on("exit", status => { if (!stdout.includes("READY\n")) reject(Error(`worker exited before barrier: ${status} ${stderr}`)); });
    });
    const done = new Promise<{ sentAt?: number; code?: string }[]>((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", status => { if (status !== 0) reject(Error(`worker failed: ${stderr}`)); else {
        try { resolve(JSON.parse(stdout.replace("READY\n", ""))); } catch (error) { reject(error); }
      } });
    });
    return { child, ready, done };
  });
  try {
    await Promise.all(workers.map(w => w.ready));
    workers.forEach(w => w.child.stdin.end("GO\n"));
    const results = (await Promise.all(workers.map(w => w.done))).flat();
    assert.equal(results.filter(r => r.sentAt).length, 3, JSON.stringify(results));
    const times = (await pool.query('SELECT at FROM "AdmissionAudit" ORDER BY at')).rows.map(r => +r.at);
    assert.equal(times.length, 3);
    for (let i = 1; i < times.length; i++) assert.ok(times[i]! - times[i - 1]! >= 800);
    const search = await stateFor("amap-search"), lbs = await stateFor("amap-lbs");
    assert.equal(search.dayUsed, 203); assert.equal(search.monthUsed, 2503);
    assert.equal(lbs.dayUsed, 500); assert.equal(lbs.monthUsed, 75000);
  } finally { workers.forEach(w => { if (w.child.exitCode === null) w.child.kill(); }); }
});

test("actual PostgreSQL: agreed initialization cannot overwrite existing counters or bindings", async () => {
  await seedHalf();
  await pool.query(`UPDATE "AmapResource" SET "dayUsed"=201, "monthUsed"=2501 WHERE id='amap-search'`);
  const client = await pool.connect();
  try {
    await assert.rejects(client.query(await readFile("scripts/initialize-amap-admission.sql", "utf8")));
    await client.query("ROLLBACK");
    const search = await stateFor("amap-search");
    assert.equal(search.dayUsed, 201); assert.equal(search.monthUsed, 2501);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM "AmapOperationBinding" WHERE "credentialId"='primary'`)).rows[0].n, 3);
  } finally { client.release(); }
});

test("actual PostgreSQL: injected grant latency below/above 400ms is handled conservatively", async () => {
  for (const delayMs of [230, 450]) {
    await seedHalf(); let sends = 0;
    const delayed: AdmissionDatabase = { async execute(...args) {
      const result = await db.execute(...args); if (args[0] === "grant") await cancellableDelay(delayMs); return result;
    } };
    const transport = createAmapTransport(async () => { sends++; return Response.json({ status: "1" }); }, { beforeAttempt: createAdmission(new PostgresAdmissionStore(delayed), "test") });
    const request = transport.requestJson(new URL("https://restapi.amap.com/v5/place/around?key=fake"), "nearby");
    if (delayMs < 400) await request;
    else await assert.rejects(request, code("ADMISSION_WAIT_EXCEEDED"));
    assert.equal(sends, delayMs < 400 ? 1 : 0);
    const search = await stateFor("amap-search");
    assert.equal(search.dayUsed, 201); assert.equal(search.monthUsed, 2501);
  }
});

test("actual PostgreSQL: lost COMMIT acknowledgement burns one unit but sends nothing", async () => {
  await seed(10, 10, 1); let transactions = 0, sends = 0;
  const ambiguous: AdmissionDatabase = { async execute(...args) {
    const result = await db.execute(...args);
    if (++transactions === 2) throw Error("simulated lost commit acknowledgement"); return result;
  } };
  const transport = createAmapTransport(async () => { sends++; return Response.json({ status: "1" }); }, { beforeAttempt: createAdmission(new PostgresAdmissionStore(ambiguous), "test") });
  await assert.rejects(transport.requestJson(new URL("https://restapi.amap.com/v3/geocode/geo?key=fake"), "geocode"), code("ADMISSION_UNAVAILABLE"));
  assert.equal(transactions, 2); assert.equal(sends, 0); assert.equal((await state()).dayUsed, 1); assert.equal((await state()).monthUsed, 1);
});

test("actual PostgreSQL: binding remap and deletion invalidate outstanding tickets", async () => {
  for (const remap of [true, false]) {
    await seed(10, 10, 1);
    const ticket = await store.reserve("test", "nearby", signal, remaining);
    if (remap) {
      await pool.query(`INSERT INTO "AmapResource" (id,enabled,"dailyLimit","monthlyLimit") VALUES ('other',true,10,10)`);
      await pool.query(`UPDATE "AmapOperationBinding" SET "resourceId"='other' WHERE operation='nearby'`);
    } else await pool.query(`DELETE FROM "AmapOperationBinding" WHERE operation='nearby'`);
    await assert.rejects(store.grant("test", "nearby", ticket, signal, remaining), code("ADMISSION_UNAVAILABLE"));
    assert.equal((await state()).dayUsed, 0);
  }
});

test("actual PostgreSQL: a remap while reserve waits for its resource is revalidated under the binding lock", async () => {
  await seed(10, 10, 1);
  await pool.query(`INSERT INTO "AmapResource" (id,enabled,"dailyLimit","monthlyLimit") VALUES ('other',true,10,10)`);
  const blocker = await pool.connect();
  try {
    await blocker.query("BEGIN"); await blocker.query(`SELECT id FROM "AmapResource" WHERE id='shared' FOR UPDATE`);
    const refused = assert.rejects(store.reserve("test", "nearby", signal, remaining), code("ADMISSION_UNAVAILABLE"));
    await cancellableDelay(25);
    await pool.query(`UPDATE "AmapOperationBinding" SET "resourceId"='other' WHERE operation='nearby'`);
    await blocker.query("ROLLBACK"); await refused;
    assert.equal((await state()).nextReservationAt.getTime(), 0);
  } finally { await blocker.query("ROLLBACK"); blocker.release(); }
});

test("actual PostgreSQL: readiness recheck owns no connection while waiting and spends once", async () => {
  await seed(10, 10, 1);
  const phases: string[] = []; let waits = 0;
  const observed: AdmissionDatabase = { async execute(...args) {
    phases.push(args[0]); const result = await db.execute(...args);
    // A different, late ticket may move the final barrier after this reservation.
    if (args[0] === "reserve") await pool.query(`UPDATE "AmapResource" SET "nextGrantAt"=clock_timestamp()+interval '90 milliseconds'`);
    if ((result.value as { code: string }).code === "WAIT") {
      waits++; assert.equal(admissionPool.idleCount, admissionPool.totalCount); assert.equal((await state()).dayUsed, 0);
    }
    return result;
  } };
  const permit = await createAdmission(new PostgresAdmissionStore(observed), "test")("nearby", signal);
  assert.ok(permit); permit.assertValid();
  assert.deepEqual(phases, ["reserve", "grant", "grant"]); assert.equal(waits, 1); assert.equal((await state()).dayUsed, 1);
});

test("actual PostgreSQL: reservations honor a later grant barrier without changing counters", async () => {
  await seed(10, 10, 1);
  await pool.query(`UPDATE "AmapResource" SET "nextGrantAt"=clock_timestamp()+interval '100 milliseconds'`);
  const before = await state();
  const bindings = (await pool.query('SELECT * FROM "AmapOperationBinding" ORDER BY operation')).rows;
  await pool.query(await readFile("prisma/migrations/20261029000000_amap_admission_slot_alignment/migration.sql", "utf8"));
  assert.deepEqual(await state(), before);
  assert.deepEqual((await pool.query('SELECT * FROM "AmapOperationBinding" ORDER BY operation')).rows, bindings);
  const ticket = await store.reserve("test", "nearby", signal, remaining);
  const reserved = await state();
  assert.ok(ticket.scheduledAt.getTime() >= before.nextGrantAt.getTime());
  assert.equal(reserved.dayUsed, before.dayUsed);
  assert.equal(reserved.monthUsed, before.monthUsed);
  assert.equal(+reserved.nextGrantAt, +before.nextGrantAt);
  assert.equal(reserved.policyVersion, before.policyVersion);
  await cancellableDelay(ticket.delayMs);
  const grant = await store.grant("test", "nearby", ticket, signal, remaining);
  assert.ok(grant.validForMs !== undefined);
  assert.equal((await state()).dayUsed, 1);
});

test("actual PostgreSQL: function SQL timeout rolls back writes and leaves the pipeline reusable", async () => {
  await seed(10, 10, 1);
  await pool.query(`CREATE FUNCTION admission_slow_write() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW."dayUsed" <> OLD."dayUsed" THEN PERFORM pg_sleep(5); END IF; RETURN NEW; END; $$;
    CREATE TRIGGER admission_slow_write BEFORE UPDATE ON "AmapResource" FOR EACH ROW EXECUTE FUNCTION admission_slow_write();`);
  try {
    const mock = simulated(); await assert.rejects(mock.run(), code("ADMISSION_UNAVAILABLE"));
    assert.equal(mock.sends(), 0); assert.equal((await state()).dayUsed, 0);
  } finally { await pool.query('DROP TRIGGER admission_slow_write ON "AmapResource"; DROP FUNCTION admission_slow_write();'); }
  await simulated().run(); assert.equal((await state()).dayUsed, 1);
});

test("actual PostgreSQL: cancellation after dispatch drains the committed batch without an HTTP send", async () => {
  await seed(10, 10, 1);
  await pool.query(`CREATE FUNCTION admission_delayed_write() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW."dayUsed" <> OLD."dayUsed" THEN PERFORM pg_sleep(0.1); END IF; RETURN NEW; END; $$;
    CREATE TRIGGER admission_delayed_write BEFORE UPDATE ON "AmapResource" FOR EACH ROW EXECUTE FUNCTION admission_delayed_write();`);
  const parent = new AbortController(); let sends = 0;
  const observed: AdmissionDatabase = { execute(...args) {
    if (args[0] === "grant") setTimeout(() => parent.abort(), 30);
    return db.execute(...args);
  } };
  try {
    const transport = createAmapTransport(async () => { sends++; return Response.json({ status: "1" }); }, { beforeAttempt: createAdmission(new PostgresAdmissionStore(observed), "test") });
    await assert.rejects(transport.requestJson(new URL("https://restapi.amap.com/v5/place/around?key=fake"), "nearby", createRequestContext(parent.signal)));
    await cancellableDelay(150);
    assert.equal(sends, 0); assert.equal((await state()).dayUsed, 1); assert.equal(admissionPool.idleCount, admissionPool.totalCount);
  } finally { await pool.query('DROP TRIGGER admission_delayed_write ON "AmapResource"; DROP FUNCTION admission_delayed_write();'); }
});

test("actual PostgreSQL: driver read timeout destroys an ambiguous connection and sends no HTTP", async () => {
  await seed(10, 10, 1);
  await pool.query(`CREATE FUNCTION admission_driver_delay() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW."dayUsed" <> OLD."dayUsed" THEN PERFORM pg_sleep(0.1); END IF; RETURN NEW; END; $$;
    CREATE TRIGGER admission_driver_delay BEFORE UPDATE ON "AmapResource" FOR EACH ROW EXECUTE FUNCTION admission_driver_delay();`);
  const smallPool = new Pool({ connectionString, pipeline: true, max: 1 }); const releases: boolean[] = []; let sends = 0;
  const timed: AdmissionPool = { async connect() {
    const client = await smallPool.connect();
    return { pipeline: client.pipeline, query(query) { const timedQuery = { ...query, query_timeout: 30 }; return client.query(timedQuery); }, release(destroy = false) { releases.push(destroy); client.release(destroy); } };
  } };
  try {
    const transport = createAmapTransport(async () => { sends++; return Response.json({ status: "1" }); }, { beforeAttempt: createAdmission(new PostgresAdmissionStore(new PipelinedAdmissionDatabase(timed)), "test") });
    await assert.rejects(transport.requestJson(new URL("https://restapi.amap.com/v5/place/around?key=fake"), "nearby"), code("ADMISSION_UNAVAILABLE"));
    await cancellableDelay(150); assert.equal(sends, 0); assert.deepEqual(releases, [false, true]); assert.equal(smallPool.totalCount, 0);
    assert.ok([0, 1].includes((await state()).dayUsed)); // COMMIT may already be in flight when the acknowledgement is lost.
  } finally { await smallPool.end(); await pool.query('DROP TRIGGER admission_driver_delay ON "AmapResource"; DROP FUNCTION admission_driver_delay();'); }
});

test("actual PostgreSQL: backend disconnect during a function is handled and the checked-out connection is destroyed", async () => {
  await seed(10, 10, 1);
  await pool.query(`CREATE FUNCTION admission_disconnected_write() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW."dayUsed" <> OLD."dayUsed" THEN PERFORM pg_sleep(0.3); END IF; RETURN NEW; END; $$;
    CREATE TRIGGER admission_disconnected_write BEFORE UPDATE ON "AmapResource" FOR EACH ROW EXECUTE FUNCTION admission_disconnected_write();`);
  const scopedPool = new Pool({ connectionString, pipeline: true, max: 1 }); let sends = 0;
  try {
    const pid = (await scopedPool.query("SELECT pg_backend_pid() AS pid")).rows[0].pid as number;
    const transport = createAmapTransport(async () => { sends++; return Response.json({ status: "1" }); }, { beforeAttempt: createAdmission(new PostgresAdmissionStore(new PipelinedAdmissionDatabase(scopedPool)), "test") });
    const refused = assert.rejects(transport.requestJson(new URL("https://restapi.amap.com/v5/place/around?key=fake"), "nearby"), code("ADMISSION_UNAVAILABLE"));
    let sleeping = false;
    for (let i = 0; i < 30; i++) {
      const active = await pool.query("SELECT wait_event FROM pg_stat_activity WHERE pid=$1", [pid]);
      if (active.rows[0]?.wait_event === "PgSleep") { sleeping = true; break; }
      await cancellableDelay(5);
    }
    assert.equal(sleeping, true);
    await pool.query("SELECT pg_terminate_backend($1)", [pid]); await refused; await cancellableDelay(20);
    assert.equal(sends, 0); assert.equal((await state()).dayUsed, 0); assert.equal(scopedPool.totalCount, 0);
  } finally { await scopedPool.end(); await pool.query('DROP TRIGGER admission_disconnected_write ON "AmapResource"; DROP FUNCTION admission_disconnected_write();'); }
});

test("actual PostgreSQL: a multi-category quota stop preserves completed results and stops later sends", async () => {
  await seed(2, 10, 1); let sends = 0;
  const transport = createAmapTransport(async () => { sends++; return Response.json({ status: "1", count: "0", pois: [] }); }, { beforeAttempt: createAdmission(store, "test") });
  const client = createAmapClientWithTransport("fake", transport);
  const center = { query: "test", formattedAddress: "test", province: "", city: "", district: "", longitude: 114, latitude: 22, level: "" };
  const result = await executeResolvedSearch({ center, resolvedLocation: center, categoryIds: CATEGORIES.slice(0, 4).map(c => c.key), radiusMeters: 3000 }, client);
  assert.equal(result.status, "partial success"); assert.deepEqual(result.categories.map(c => c.status), ["empty", "empty", "error", "skipped"]);
  assert.equal(sends, 2); assert.equal((await state()).dayUsed, 2);
});

async function withTcpLatency(run: (database: PipelinedAdmissionDatabase) => Promise<void>) {
  const sockets = new Set<Socket>(), timers = new Set<ReturnType<typeof setTimeout>>();
  const proxy = createServer(downstream => {
    const upstream = connectSocket({ host: "127.0.0.1", port: Number(target.port || 5432) });
    sockets.add(downstream); sockets.add(upstream);
    const forward = (source: Socket, destination: Socket) => {
      source.on("data", chunk => { const timer = setTimeout(() => { timers.delete(timer); if (!destination.destroyed) destination.write(chunk); }, 150); timers.add(timer); });
      source.on("end", () => { destination.end(); });
      source.on("error", () => { destination.destroy(); });
      source.on("close", () => { sockets.delete(source); });
    };
    forward(downstream, upstream); forward(upstream, downstream);
  });
  await new Promise<void>(resolve => { proxy.listen(0, "127.0.0.1", resolve); });
  const address = proxy.address(); assert.ok(address && typeof address === "object");
  const delayedUrl = new URL(connectionString!); delayedUrl.port = String(address.port);
  const delayedPool = new Pool({ connectionString: delayedUrl.href, pipeline: true, max: 1, connectionTimeoutMillis: 3000 });
  try {
    await delayedPool.query("SELECT 1");
    await run(new PipelinedAdmissionDatabase(delayedPool));
  } finally {
    await delayedPool.end(); for (const timer of timers) clearTimeout(timer); for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve, reject) => { proxy.close(error => error ? reject(error) : resolve()); });
  }
}

/** Hold only the first reserve/grant COMMIT responses, preserving wire order. */
async function withCommitAckDelay(run: (database: PipelinedAdmissionDatabase, pool: Pool) => Promise<void>, delays = [696, 300]) {
  const sockets = new Set<Socket>(), timers = new Set<ReturnType<typeof setTimeout>>();
  let commits = 0;
  const proxy = createServer(downstream => {
    const upstream = connectSocket({ host: "127.0.0.1", port: Number(target.port || 5432) });
    sockets.add(downstream); sockets.add(upstream); downstream.pipe(upstream);
    let input: Buffer<ArrayBufferLike> = Buffer.alloc(0), held: Buffer[] = [], holding = false;
    upstream.on("data", chunk => {
      input = Buffer.concat([input, chunk]);
      while (input.length >= 5) {
        const size = input.readInt32BE(1) + 1;
        if (input.length < size) break;
        const frame = input.subarray(0, size); input = input.subarray(size);
        if (frame[0] === 67 && frame.subarray(5).toString() === "COMMIT\0") {
          const delay = delays[commits++] ?? 0;
          if (delay > 0) {
            holding = true; held.push(frame);
            const timer = setTimeout(() => {
              timers.delete(timer); holding = false;
              if (!downstream.destroyed) downstream.write(Buffer.concat(held));
              held = [];
            }, delay);
            timers.add(timer); continue;
          }
        }
        if (holding) held.push(frame); else if (!downstream.destroyed) downstream.write(frame);
      }
    });
    upstream.on("end", () => downstream.end());
    upstream.on("error", () => downstream.destroy()); downstream.on("error", () => upstream.destroy());
    downstream.on("close", () => { upstream.destroy(); sockets.delete(downstream); });
    upstream.on("close", () => sockets.delete(upstream));
  });
  await new Promise<void>(resolve => { proxy.listen(0, "127.0.0.1", resolve); });
  const address = proxy.address(); assert.ok(address && typeof address === "object");
  const url = new URL(connectionString!); url.port = String(address.port);
  const delayedPool = new Pool({ connectionString: url.href, pipeline: true, max: 1, connectionTimeoutMillis: 1000 });
  delayedPool.on("error", () => {});
  try { await delayedPool.query("SELECT 1"); await run(new PipelinedAdmissionDatabase(delayedPool), delayedPool); }
  finally {
    await delayedPool.end(); for (const timer of timers) clearTimeout(timer); for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => { proxy.close(() => resolve()); });
  }
}

test("actual PostgreSQL: ticket expiry drains COMMIT and allows the next category", { timeout: 10000 }, async t => {
  await seed(10, 10, 800);
  await pool.query('UPDATE "AmapResource" SET "graceMs"=800,"permitTtlMs"=400');
  await pool.query('UPDATE "AmapResource" SET "nextGrantAt"=\'1970-01-01 UTC\',"nextReservationAt"=\'1970-01-01 UTC\'');
  const logs: unknown[][] = []; t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  await withCommitAckDelay(async delayedDb => {
    const phases: AdmissionDiagnostic[] = [];
    const observed: AdmissionDatabase = { async execute(...args) {
      try { const execution = await delayedDb.execute(...args); phases.push(execution.diagnostic); return execution; }
      catch (error) { phases.push((error as { diagnostic: AdmissionDiagnostic }).diagnostic); throw error; }
    } };
    let sends = 0;
    const transport = createAmapTransport(async () => { sends++; return Response.json({ status: "1", count: "0", pois: [] }); }, { beforeAttempt: createAdmission(new PostgresAdmissionStore(observed), "test") });
    const client = createAmapClientWithTransport("fake", transport);
    const center = { query: "fixture", formattedAddress: "fixture", province: "", city: "", district: "", level: "", longitude: 114, latitude: 22 };
    const response = await executeResolvedSearch({ center, resolvedLocation: center, categoryIds: ["bakery", "billiards"], radiusMeters: 3000 }, client, { concurrency: 1 });
    assert.deepEqual(response.categories.map(c => c.status), ["error", "empty"]);
    assert.equal(response.categories[0]!.error?.code, "ADMISSION_WAIT_EXCEEDED"); assert.equal(response.termination, undefined);
    assert.equal(sends, 1); assert.equal((await state()).dayUsed, 2);
    const grant = phases.find(d => d.phase === "grant")!;
    assert.equal(grant.commitAck, "confirmed_commit"); assert.equal(grant.committed, true);
    assert.equal(grant.errorKind, "deadline"); assert.equal(grant.connectionDestroyed, false);
    assert.ok(grant.budgetMs < 250); assert.ok(grant.completionRemainingMs > 1000); assert.equal(grant.readTimeoutMs, 3000);
    const data = logs[0]![1] as { reservation: { elapsedMs: number; validForMs: number; waitMs: number } };
    assert.ok(data.reservation.elapsedMs >= 590); assert.equal(data.reservation.validForMs, 800);
    assert.ok(data.reservation.waitMs >= 0); assert.equal(logs.length, 1);
  });
});

test("actual PostgreSQL: 300ms TCP round trips complete reserve and grant in two batches", { timeout: 15000 }, async () => {
  await seedHalf();
  await withTcpLatency(async delayedDb => {
    const batches: AdmissionExecution[] = [];
    const observed: AdmissionDatabase = { async execute(...args) { const result = await delayedDb.execute(...args); batches.push(result); return result; } };
    let sends = 0;
    const transport = createAmapTransport(async () => { sends++; return Response.json({ status: "1" }); }, { beforeAttempt: createAdmission(new PostgresAdmissionStore(observed), "test") });
    const start = performance.now(); await transport.requestJson(new URL("https://restapi.amap.com/v5/place/around?key=fake"), "nearby");
    const total = performance.now() - start;
    assert.equal(sends, 1); assert.equal(batches.length, 2); assert.ok(total >= 550 && total < 1500, String(total));
    for (const batch of batches) { assert.ok(batch.diagnostic.batchMs >= 280 && batch.diagnostic.batchMs < 600); assert.equal(batch.diagnostic.committed, true); }
    assert.equal((await stateFor("amap-search")).dayUsed, 201);
    console.log("admission.tcp-latency", { totalMs: Math.round(total), batchMs: batches.map(b => b.diagnostic.batchMs) });
  });
});

test("actual PostgreSQL: cancellation before dispatch or after commit never sends", async () => {
  for (const when of ["before", "after"] as const) {
    await seed(10, 10, 1); const parent = new AbortController(); let sends = 0;
    const fault: AdmissionDatabase = { async execute(...args) {
      if (args[0] === "grant" && when === "before") parent.abort();
      const result = await db.execute(...args);
      if (args[0] === "grant" && when === "after") parent.abort();
      return result;
    } };
    const context = createRequestContext(parent.signal);
    const transport = createAmapTransport(async () => { sends++; return Response.json({ status: "1" }); }, { context, beforeAttempt: createAdmission(new PostgresAdmissionStore(fault), "test") });
    await assert.rejects(transport.requestJson(new URL("https://restapi.amap.com/v3/geocode/geo?key=fake"), "geocode"));
    await cancellableDelay(15);
    assert.equal(sends, 0); assert.equal((await state()).dayUsed, when === "before" ? 0 : 1); context.dispose();
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

test("actual PostgreSQL: acquisition deadline returns late connections to the pool", async () => {
  await seed();
  const smallPool = new Pool({ connectionString, pipeline: true, max: 1, connectionTimeoutMillis: 1000 });
  const held = await smallPool.connect(); const start = performance.now();
  const client = new PostgresAdmissionStore(new PipelinedAdmissionDatabase(smallPool));
  try {
    await assert.rejects(client.reserve("test", "geocode", signal, remaining), code("ADMISSION_UNAVAILABLE"));
    assert.ok(performance.now() - start < 900);
  } finally { held.release(); }
  await cancellableDelay(20);
  assert.equal(smallPool.waitingCount, 0); assert.equal(smallPool.idleCount, 1);
  await smallPool.end();
});

test("actual PostgreSQL: server SQL timeout rolls back the pipelined batch and resets limits", async () => {
  const client = await admissionPool.connect(); const start = performance.now();
  try {
    const results = await Promise.allSettled([
      client.query("BEGIN"),
      client.query("SELECT set_config('statement_timeout','80',true),set_config('idle_in_transaction_session_timeout','800',true)"),
      client.query("SELECT pg_sleep(5)"), client.query("COMMIT")
    ]);
    assert.equal(results[2]!.status, "rejected");
    assert.equal((results[2] as PromiseRejectedResult).reason.code, "57014");
    assert.equal((results[3] as PromiseFulfilledResult<{ command: string }>).value.command, "ROLLBACK");
    assert.ok(performance.now() - start < 1000);
    const r = await client.query("SELECT current_setting('statement_timeout') AS timeout"); assert.equal(r.rows[0].timeout, "0");
  } finally { client.release(); }
  const rows = await pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE state='active' AND query='SELECT pg_sleep(5)'");
  assert.equal(rows.rows[0].n, 0);
});

test("actual PostgreSQL: reserve/grant delayed acknowledgements drain independently of caller expiry", { timeout: 45000 }, async t => {
  t.mock.method(console, "error", () => {});
  for (const phase of ["reserve", "grant"] as const) for (const delay of [100, 400, 1200, 2500, 3300]) {
    await seed(100, 100, 1);
    await withCommitAckDelay(async (database, scopedPool) => {
      const phases: AdmissionDiagnostic[] = [];
      let drain: Promise<unknown> | undefined, sends = 0;
      const observed: AdmissionDatabase = { execute(...args) {
        const work = database.execute(...args).then(result => { phases.push(result.diagnostic); return result; }, error => {
          phases.push(error.diagnostic); throw error;
        });
        if (args[0] === phase) drain = work;
        return work;
      } };
      const transport = createAmapTransport(async () => { sends++; return Response.json({ status: "1", pois: [] }); }, {
        beforeAttempt: createAdmission(new PostgresAdmissionStore(observed), "test")
      });
      const url = new URL("https://restapi.amap.com/v5/place/around?key=fake");
      const started = performance.now();
      await transport.requestJson(url, "nearby").catch(error => {
        assert.ok(error instanceof AdmissionError); assert.equal(error.code, "ADMISSION_WAIT_EXCEEDED");
      });
      const callerMs = performance.now() - started;
      assert.ok(callerMs < 2250, `${phase}/${delay}: caller ${callerMs}`);
      assert.ok(drain); await drain.catch(() => {});
      const diagnostic = phases.find(d => d.phase === phase)!;
      assert.equal(diagnostic.readTimeoutMs, 3000);
      assert.equal(diagnostic.commitAck, delay > 3000 ? "unconfirmed" : "confirmed_commit");
      assert.equal(diagnostic.connectionDestroyed, delay > 3000);
      if (delay > 3000) { assert.equal(diagnostic.errorKind, "driver_read_timeout"); assert.equal(scopedPool.totalCount, 0); }
      else { assert.equal(scopedPool.idleCount, 1); const client = await scopedPool.connect(); assert.equal(client.getTransactionStatus(), "I"); client.release(); }
      if (delay >= (phase === "grant" ? 400 : 1200)) assert.equal(sends, 0);
      assert.equal((await state()).dayUsed, phase === "grant" || sends > 0 ? 1 : 0);
      // A fresh category gets a new ticket after the old batch has settled.
      const before = sends; await transport.requestJson(url, "nearby"); assert.equal(sends, before + 1);
      console.log("admission.ack-matrix", { phase, delayMs: delay, callerMs: Math.round(callerMs), commitAck: diagnostic.commitAck, replaced: diagnostic.connectionDestroyed });
    }, phase === "reserve" ? [delay] : [0, delay]);
  }
});

test("actual PostgreSQL: transient SQL and socket failures recover in the same search", async t => {
  t.mock.method(console, "error", () => {});
  for (const fault of ["57014", "55P03", "40P01", "40001", "disconnect", "read_timeout"] as const) {
    await seed(100, 100, 1);
    const scopedPool = new Pool({ connectionString, pipeline: true, max: 1 });
    const pids: number[] = [], releases: boolean[] = [];
    let inject = true, sends = 0;
    const observed: AdmissionPool = { async connect() {
      const client = await scopedPool.connect(); pids.push((await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
      return { pipeline: client.pipeline, getTransactionStatus: () => client.getTransactionStatus(),
        on: (event, listener) => client.on(event, listener), removeListener: (event, listener) => client.removeListener(event, listener),
        query(config) {
          if (inject && config.text.includes("amap_admission_reserve_v1")) {
            inject = false;
            if (fault === "disconnect") return client.query({ ...config, text: "SELECT pg_terminate_backend(pg_backend_pid())", values: [] });
            if (fault === "read_timeout") {
              const timedQuery = { ...config, text: "SELECT pg_sleep(0.1)", values: [], query_timeout: 30 };
              return client.query(timedQuery);
            }
            return client.query({ ...config, text: `DO $$ BEGIN RAISE EXCEPTION USING ERRCODE = '${fault}'; END $$`, values: [] });
          }
          return client.query(config);
        }, release(destroy = false) { releases.push(destroy); client.release(destroy); }
      };
    } };
    try {
      const transport = createAmapTransport(async () => { sends++; return Response.json({ status: "1", pois: [] }); }, { beforeAttempt: createAdmission(new PostgresAdmissionStore(new PipelinedAdmissionDatabase(observed)), "test") });
      const center = { query: "fixture", formattedAddress: "fixture", province: null, city: null, district: null, level: null, longitude: 114, latitude: 22 };
      const response = await executeResolvedSearch({ center, resolvedLocation: center, categoryIds: ["bakery", "billiards", "gym"], radiusMeters: 3000 }, createAmapClientWithTransport("fake", transport));
      assert.deepEqual(response.categories.map(c => c.status), ["error", "empty", "empty"], fault);
      assert.equal(response.termination, undefined); assert.equal(sends, 2);
      const replaced = fault === "disconnect" || fault === "read_timeout";
      assert.equal(releases[0], replaced);
      assert.equal(pids[0] === pids[1], !replaced);
      assert.equal((await state()).dayUsed, 2);
    } finally { await scopedPool.end(); }
  }
});

test("actual PostgreSQL: 5s transaction idle timeout terminates only its idle session", { timeout: 7000 }, async () => {
  const scopedPool = new Pool({ connectionString, pipeline: true, max: 1 });
  const client = await scopedPool.connect(); let observed: { code?: string } | undefined;
  client.on("error", error => { observed ??= error as { code?: string }; });
  try {
    await client.query("BEGIN"); await client.query("SET LOCAL idle_in_transaction_session_timeout='5s'");
    await cancellableDelay(5150); assert.equal(observed?.code, "25P03"); client.release(true);
    const next = await scopedPool.connect(); assert.equal(next.getTransactionStatus(), "I"); await next.query("SELECT 1"); next.release();
  } finally { await scopedPool.end(); }
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
    const { getAdmissionRuntime, prisma } = await import("../src/db/prisma.js");
    await getAdmissionRuntime().close(); await prisma.$disconnect();
    for (const [name, value] of [["DATABASE_URL", saved.database], ["AMAP_WEB_SERVICE_KEY", saved.key], ["AMAP_CREDENTIAL_ID", saved.credential]] as const)
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});
