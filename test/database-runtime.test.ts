import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { EventEmitter } from "node:events";

const before = { database: process.env.DATABASE_URL, vercel: process.env.VERCEL };
process.env.DATABASE_URL = "fixture-only"; process.env.VERCEL = "1";
let attached = 0, queries = 0;
class Pool extends EventEmitter {
  totalCount = 0;
  ending = false;
  constructor(readonly options: Record<string, unknown>) { super(); }
  async query() { queries++; this.totalCount = 1; return { rows: [{ ok: 1 }] }; }
  async end() { this.ending = true; }
}
class PrismaPg { constructor(readonly input: unknown, readonly options?: unknown) {} }
class PrismaClient {
  constructor(readonly options: { adapter: PrismaPg }) {}
  async $queryRawUnsafe() { queries++; const pool = this.options.adapter.input; if (pool instanceof Pool) pool.totalCount = 1; return [{ ok: 1 }]; }
}
mock.module("pg", { namedExports: { Pool } });
mock.module("@prisma/adapter-pg", { namedExports: { PrismaPg } });
mock.module("@vercel/functions/db-connections", { namedExports: { attachDatabasePool: () => { attached++; } } });
mock.module("../generated/prisma/client.js", { namedExports: { PrismaClient } });
const db = await import("../src/db/prisma.js");
const { prepareServerAdmission } = await import("../src/server/admission.js");

test("ordinary client retains its configuration; Vercel admission owns one attached pool", async () => {
  const ordinary = db.prisma as unknown as PrismaClient;
  assert.deepEqual(ordinary.options.adapter.input, { connectionString: "fixture-only" });
  const a = db.getAdmissionRuntime(), b = db.getAdmissionRuntime();
  assert.equal(a, b); assert.equal(a.database, b.database); assert.equal(attached, 1);
  const pool = a.pool as unknown as Pool;
  assert.equal(pool.options.pipeline, true);
  assert.equal(pool.options.min, 0); assert.equal(pool.options.idleTimeoutMillis, 5000);
  assert.equal(queries, 0); // Import/assembly alone issues no SQL.
  await Promise.all([prepareServerAdmission(), prepareServerAdmission()]);
  assert.equal(queries, 1); assert.equal(attached, 1);
});

test("Vercel idle removal and pool errors invalidate the actual shared readiness", async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
  const state = db.getAdmissionRuntime();
  const pool = state.pool as unknown as Pool;
  pool.totalCount = 0; pool.emit("remove");
  await prepareServerAdmission(); assert.equal(queries, 2);
  await new Promise(resolve => setTimeout(resolve, 0));
  pool.emit("error", Error("SECRET connection failure"));
  await prepareServerAdmission(); assert.equal(queries, 3); assert.equal(attached, 1);
});

test("removing one connection preserves the readiness of remaining healthy clients", async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
  const state = db.getAdmissionRuntime(), pool = state.pool as unknown as Pool;
  const beforeQueries = queries;
  pool.totalCount = 1; pool.emit("remove");
  await prepareServerAdmission(); assert.equal(queries, beforeQueries);
});

test.after(() => {
  if (before.database === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = before.database;
  if (before.vercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = before.vercel;
});
