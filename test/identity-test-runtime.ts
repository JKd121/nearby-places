import { Pool } from "pg";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export function configureIdentityTest() {
  const url = process.env.NEARBY_IDENTITY_TEST_DATABASE_URL;
  if (!url) throw new Error("Set NEARBY_IDENTITY_TEST_DATABASE_URL to a disposable loopback database");
  const target = new URL(url);
  if (target.hostname !== "127.0.0.1" || !target.pathname.startsWith("/nearby_identity_test")) throw new Error("Refusing non-test database");
  process.env.DATABASE_URL = url; process.env.DIRECT_URL = url;
  process.env.NEARBY_ACCESS_MODE = process.env.NEARBY_IDENTITY_TEST_ACCESS_MODE ?? "verified";
  process.env.BETTER_AUTH_URL = "http://localhost:3127";
  process.env.BETTER_AUTH_SECRET = "test-auth-secret-".repeat(4);
  process.env.NEARBY_GUEST_SECRET = "test-guest-secret-".repeat(4);
  process.env.NEARBY_FINGERPRINT_SECRET = "test-fingerprint-secret-".repeat(4);
  process.env.NEARBY_CREDENTIAL_KEYS = JSON.stringify({ "1": "11".repeat(32) });
  process.env.SMTP_HOST = "127.0.0.1"; process.env.SMTP_PORT = "25260"; process.env.SMTP_FROM = "nearby@example.test";
  process.env.AMAP_WEB_SERVICE_KEY = "f".repeat(32); process.env.AMAP_CREDENTIAL_ID = "primary";
  return url;
}
export async function resetIdentityDatabase(url: string, beforeMigration?: (name: string, pool: Pool) => Promise<void>) {
  const target = new URL(url);
  if (target.hostname !== "127.0.0.1" || !target.pathname.startsWith("/nearby_identity_test")) throw new Error("Refusing non-test database");
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    for (const migration of (await readdir("prisma/migrations")).sort()) {
      await beforeMigration?.(migration, pool);
      if (migration === "20261104000000_dual_identity_byok") {
        await pool.query(`INSERT INTO "SearchHistory" (id,"visitorId","dedupeKey",query,"categoryIds","radiusMeters") VALUES ('legacy-before-upgrade','legacy-browser','legacy','迁移前历史',ARRAY['hotel'],3000)`);
        await pool.query(`INSERT INTO "AmapResource" (id,enabled,"dailyLimit","monthlyLimit",day,month,"dayUsed","monthUsed") VALUES ('public-test',true,100000,100000,'2000-01-01','2000-01',17,23)`);
      }
      if (/^\d/.test(migration)) await pool.query(await readFile(join("prisma/migrations", migration, "migration.sql"), "utf8"));
    }
    for (const operation of ["geocode", "poi-text", "nearby"]) await pool.query('INSERT INTO "AmapOperationBinding" ("credentialId",operation,"resourceId") VALUES ($1,$2,$3)', ["primary", operation, "public-test"]);
  } finally { await pool.end(); }
}
