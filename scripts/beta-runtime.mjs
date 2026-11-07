import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { parse } from "dotenv";

export const root = resolve(import.meta.dirname, "..");
export const betaDir = join(root, ".local", "nearby-beta");
export const configPath = join(betaDir, "environment.json");
const executable = name => process.platform === "win32" ? `${name}.exe` : name;

export function postgresBin() {
  if (process.env.NEARBY_POSTGRES_BIN) return resolve(process.env.NEARBY_POSTGRES_BIN);
  const cached = join(tmpdir(), "nearby-admission-pg-20261027", "node_modules", "@embedded-postgres", "windows-x64", "native", "bin");
  if (existsSync(join(cached, executable("pg_ctl")))) return cached;
  const found = spawnSync(process.platform === "win32" ? "where.exe" : "which", ["pg_ctl"], { encoding: "utf8", windowsHide: true });
  if (found.status === 0 && found.stdout.trim()) return resolve(found.stdout.trim().split(/\r?\n/)[0], "..");
  throw new Error("请设置 NEARBY_POSTGRES_BIN，指向包含 initdb、pg_ctl 的 PostgreSQL bin 目录");
}
export function run(binary, args, env = process.env, stdio = "inherit") {
  return new Promise((done, fail) => {
    const child = spawn(binary, args, { cwd: root, env, stdio, windowsHide: true });
    child.on("error", () => fail(new Error("启动子进程失败，请检查工具路径")));
    child.on("exit", code => code === 0 ? done() : fail(new Error(`子进程失败（退出码 ${code}）`)));
  });
}
export async function readConfig(path = configPath) {
  const env = JSON.parse(await readFile(path, "utf8"));
  if (!["local-beta", "private-beta"].includes(env.NEARBY_ACCESS_MODE)) throw new Error("请选择明确的内测环境配置文件");
  if (!env.DATABASE_URL || !env.DIRECT_URL || !env.BETTER_AUTH_URL) throw new Error("内测环境配置缺少数据库或应用地址");
  return env;
}
export function assertLocalConfig(env) {
  for (const name of ["DATABASE_URL", "DIRECT_URL"]) {
    const url = new URL(env[name]);
    if (url.hostname !== "127.0.0.1" || url.port !== "55440" || url.pathname !== "/nearby_beta_local") throw new Error("本机管理命令仅操作 127.0.0.1:55440/nearby_beta_local");
  }
  if (env.BETTER_AUTH_URL !== "http://localhost:3130" || env.NEARBY_ACCESS_MODE !== "local-beta") throw new Error("本机应用配置不匹配");
}
export async function ensureConfig() {
  if (existsSync(configPath)) { const env = await readConfig(); assertLocalConfig(env); return env; }
  let inherited = {};
  try { const source = parse(await readFile(join(root, ".env"))); inherited = { AMAP_WEB_SERVICE_KEY: source.AMAP_WEB_SERVICE_KEY, AMAP_CREDENTIAL_ID: source.AMAP_CREDENTIAL_ID }; } catch (error) { if (error.code !== "ENOENT") throw error; }
  const password = randomBytes(24).toString("hex");
  const url = `postgresql://nearby_beta:${password}@127.0.0.1:55440/nearby_beta_local`;
  const env = {
    NEARBY_ACCESS_MODE: "local-beta", BETTER_AUTH_URL: "http://localhost:3130", DATABASE_URL: url, DIRECT_URL: url,
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), NEARBY_GUEST_SECRET: randomBytes(32).toString("hex"),
    NEARBY_FINGERPRINT_SECRET: randomBytes(32).toString("hex"), NEARBY_CREDENTIAL_KEY_VERSION: "1",
    NEARBY_CREDENTIAL_KEYS: JSON.stringify({ "1": randomBytes(32).toString("hex") }),
    AMAP_WEB_SERVICE_KEY: process.env.AMAP_WEB_SERVICE_KEY ?? inherited.AMAP_WEB_SERVICE_KEY ?? "",
    AMAP_CREDENTIAL_ID: process.env.AMAP_CREDENTIAL_ID ?? inherited.AMAP_CREDENTIAL_ID ?? "primary",
    NEARBY_GUEST_DAILY_LIMIT: "60", NEARBY_GUEST_INTERVAL_MS: "500", NEARBY_ACCOUNT_INTERVAL_MS: "500",
    NEARBY_MAX_UPSTREAM_CONCURRENT: "12", NEARBY_ACCOUNT_SEARCH_ENABLED: "true",
  };
  await mkdir(betaDir, { recursive: true });
  await writeFile(configPath, JSON.stringify(env, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  return env;
}
export async function startDatabase(env) {
  assertLocalConfig(env);
  const bin = postgresBin(), data = join(betaDir, "postgres");
  if (!existsSync(join(data, "PG_VERSION"))) {
    const passwordFile = join(betaDir, "postgres-password");
    await writeFile(passwordFile, decodeURIComponent(new URL(env.DATABASE_URL).password), { mode: 0o600 });
    await run(join(bin, executable("initdb")), ["-D", data, "-U", "nearby_beta", "--pwfile=" + passwordFile, "--auth-host=scram-sha-256", "--auth-local=scram-sha-256", "--encoding=UTF8", "--locale=C"]);
  }
  const state = spawnSync(join(bin, executable("pg_ctl")), ["-D", data, "status"], { stdio: "ignore", windowsHide: true });
  // A background PostgreSQL must not inherit terminal/pipeline handles from npm.
  if (state.status !== 0) await run(join(bin, executable("pg_ctl")), ["-D", data, "-l", join(betaDir, "postgres.log"), "-o", "-h 127.0.0.1 -p 55440", "-w", "start"], process.env, "ignore");
  const admin = new URL(env.DATABASE_URL); admin.pathname = "/postgres";
  const pool = new Pool({ connectionString: admin.href });
  try { if (!(await pool.query("SELECT 1 FROM pg_database WHERE datname='nearby_beta_local'")).rowCount) await pool.query('CREATE DATABASE nearby_beta_local'); }
  finally { await pool.end(); }
}
export async function stopDatabase() {
  const data = join(betaDir, "postgres");
  if (!existsSync(join(data, "PG_VERSION"))) return;
  const binary = join(postgresBin(), executable("pg_ctl"));
  const state = spawnSync(binary, ["-D", data, "status"], { stdio: "ignore", windowsHide: true });
  if (state.status === 0) await run(binary, ["-D", data, "-m", "fast", "-w", "stop"]);
}
export async function migrateAndBind(env) {
  assertLocalConfig(env);
  await run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--config", "prisma7.config.ts"], { ...process.env, ...env });
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    // Conservative public fallback budgets; repeat startup preserves counters/configuration.
    await pool.query(`INSERT INTO "AmapResource" (id,enabled,"dailyLimit","monthlyLimit",day,month) VALUES ('public-local-beta',true,300,3000,'2000-01-01','2000-01') ON CONFLICT DO NOTHING`);
    for (const operation of ["geocode", "poi-text", "nearby"]) await pool.query(`INSERT INTO "AmapOperationBinding" ("credentialId",operation,"resourceId") VALUES ($1,$2,'public-local-beta') ON CONFLICT DO NOTHING`, [env.AMAP_CREDENTIAL_ID, operation]);
  } finally { await pool.end(); }
}
