import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { root, betaDir, configPath, ensureConfig, readConfig, assertLocalConfig, startDatabase, stopDatabase, migrateAndBind, run } from "./beta-runtime.mjs";

const [command, ...args] = process.argv.slice(2);
const value = key => { const index = args.indexOf(key); return index < 0 ? undefined : args[index + 1]; };
const pidFile = join(betaDir, "application.json");
async function account(env, operation, email, extra = []) {
  await run(process.execPath, ["--import", "tsx", "--conditions=react-server", "scripts/beta-account.ts", operation, "--email", email, ...extra], { ...process.env, ...env, NEARBY_BETA_MANAGEMENT: "1" });
}
async function stopApp() {
  if (!existsSync(pidFile)) return;
  const state = JSON.parse(await readFile(pidFile, "utf8"));
  // Ask the process holding this private pipe to stop; never kill an arbitrary persisted PID.
  const { request } = await import("node:http");
  await new Promise(done => {
    const req = request({ socketPath: state.socket, path: "/stop", method: "POST", headers: { authorization: `Bearer ${state.token}` }, timeout: 2000 }, res => { res.resume(); res.on("end", done); });
    req.on("error", done); req.on("timeout", () => { req.destroy(); done(); }); req.end();
  });
}
async function appRunning() {
  if (!existsSync(pidFile)) return false;
  const state = JSON.parse(await readFile(pidFile, "utf8"));
  const { request } = await import("node:http");
  return new Promise(done => {
    const req = request({ socketPath: state.socket, path: "/health", headers: { authorization: `Bearer ${state.token}` }, timeout: 1000 }, res => { res.resume(); done(res.statusCode === 200); });
    req.on("error", () => done(false)); req.on("timeout", () => { req.destroy(); done(false); }); req.end();
  });
}
try {
  if (command === "stop") { await stopApp(); await stopDatabase(); console.log("本机内测环境已停止，数据保留。"); }
  else if (command === "init") {
    const env = await ensureConfig(); await startDatabase(env); await migrateAndBind(env);
    const email = value("--email");
    if (email) await account(env, "init-developer", email);
    else console.log("环境已准备，已有账号可直接启动。创建首个开发者账号请在交互终端执行 npm run beta:init -- --email 你的邮箱。");
  } else if (command === "account") {
    const path = value("--env-file"), env = await readConfig(path ? resolve(path) : configPath);
    const db = new URL(env.DIRECT_URL), target = `${db.hostname}:${db.port || "5432"}${db.pathname}`;
    console.log(`目标：${target} · 模式：${env.NEARBY_ACCESS_MODE}`);
    if (path) {
      if (env.NEARBY_ACCESS_MODE !== "private-beta" || value("--confirm-target") !== target) throw new Error("远程内测管理要求 private-beta，并显式传入 --confirm-target 主机:端口/数据库");
      if (new URL(env.DATABASE_URL).host !== db.host || new URL(env.DATABASE_URL).pathname !== db.pathname) throw new Error("管理时 DATABASE_URL 与 DIRECT_URL 必须指向同一明确的直连目标");
    } else { assertLocalConfig(env); await startDatabase(env); }
    const operation = args[0], email = value("--email");
    if (!["create", "reset-password", "disable"].includes(operation) || !email) throw new Error("用法：beta:account -- create|reset-password|disable --email 邮箱 [--env-file 文件 --confirm-target 主机:端口/数据库]");
    await account(env, operation, email);
  } else if (command === "dev") {
    if (await appRunning()) throw new Error("本机内测应用已启动，请访问 http://localhost:3130；重启前运行 beta:stop");
    const env = await readConfig(); assertLocalConfig(env); await startDatabase(env); await migrateAndBind(env);
    const { createServer } = await import("node:http"); const { randomBytes } = await import("node:crypto");
    const token = randomBytes(32).toString("hex");
    const socket = process.platform === "win32" ? `\\\\.\\pipe\\nearby-beta-${randomBytes(8).toString("hex")}` : join(betaDir, `control-${randomBytes(8).toString("hex")}.sock`);
    const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--port", "3130", "--hostname", "localhost"], { cwd: root, env: { ...process.env, ...env, NODE_ENV: "development" }, stdio: "inherit", windowsHide: true });
    const server = createServer((req, res) => {
      if (req.method === "GET" && req.url === "/health" && req.headers.authorization === `Bearer ${token}`) { res.end("ok"); return; }
      if (req.method !== "POST" || req.url !== "/stop" || req.headers.authorization !== `Bearer ${token}`) { res.writeHead(403).end(); return; }
      res.end("stopping"); child.kill();
    });
    await new Promise(done => server.listen(socket, done));
    await writeFile(pidFile, JSON.stringify({ socket, token }), { mode: 0o600 });
    const stop = () => child.kill(); process.on("SIGINT", stop); process.on("SIGTERM", stop);
    child.on("error", () => { console.error("应用启动失败"); server.close(); process.exitCode = 1; });
    child.on("exit", code => { server.close(); process.exitCode = code ?? 0; });
    console.log("本机内测：http://localhost:3130；停止命令 npm run beta:stop。账号、Key 和历史将保留。");
  } else throw new Error("使用 beta:init、beta:dev、beta:stop 或 beta:account");
} catch (error) { console.error(error instanceof Error ? error.message : "内测命令执行失败"); process.exitCode = 1; }
