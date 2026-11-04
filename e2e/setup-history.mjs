import checkBuild from "./check-build.mjs";
import { Pool } from "pg";
import { spawnSync } from "node:child_process";
import { historyDatabaseUrl } from "./database-target.mjs";

export default async function setup() {
  checkBuild();
  const target = historyDatabaseUrl();
  const admin = new URL(target);
  admin.pathname = "/postgres";
  const pool = new Pool({ connectionString: admin.href, connectionTimeoutMillis: 3_000 });
  try {
    const name = target.pathname.slice(1);
    if (!(await pool.query("SELECT 1 FROM pg_database WHERE datname = $1", [name])).rowCount) {
      // Identifier constrained by historyDatabaseUrl; only this dedicated database is created.
      await pool.query(`CREATE DATABASE "${name}"`);
    }
  } finally { await pool.end(); }
  const result = spawnSync(process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy", "--config", "prisma7.config.ts"],
    { stdio: "inherit", env: { ...process.env, DATABASE_URL: target.href, DIRECT_URL: target.href } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("History test database migration failed");
}
