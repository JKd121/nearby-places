import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { parseConfig, SYNTHETIC_CONFIG, type Mode } from "./model.js";
import { runExperiment, type Runtime } from "./runner.js";
import { claimLiveBudget, reportWriter } from "./storage.js";

export function parseArgs(args: string[]): { mode: Mode; configPath: string | undefined; authorized: boolean } {
  let mode: Mode = "dry", configPath: string | undefined, authorized = false;
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]!;
    if (seen.has(flag)) throw new Error("Duplicate option");
    seen.add(flag);
    if (flag === "--authorize-live-9") authorized = true;
    else if (flag === "--mode" || flag === "--config") {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error("Missing option value");
      if (flag === "--mode") { if (!["dry", "mock", "live"].includes(value)) throw new Error("Invalid mode"); mode = value as Mode; }
      else configPath = value;
    } else throw new Error("Unknown option");
  }
  if (mode === "live" && (!authorized || !configPath) || mode !== "live" && authorized) throw new Error("Live requires separate authorization and local config");
  return { mode, configPath, authorized };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = args.configPath ? parseConfig(JSON.parse(readFileSync(args.configPath, "utf8"))) : SYNTHETIC_CONFIG;
  // Compiled CLI location, independent of cwd; parameters cannot redirect/reset the live ledger.
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  if (realpathSync(fileURLToPath(import.meta.url)) !== realpathSync(join(root, "dist/scripts/experiments/poi-union/cli.js")) || JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name !== "amap-nearby-spike") throw new Error("Use the compiled CLI in the original checkout");
  const local = join(root, ".local", "poi-union-v1");
  const output = join(local, "reports", `${args.mode}-${Date.now()}-${randomUUID()}`);
  const checkpoint = reportWriter(output);
  let createRuntime: (() => Promise<Runtime>) | undefined;
  let preparedRuntime: Runtime | undefined;
  if (args.mode === "live") {
    const { prepareLiveRuntime } = await import("./live.js");
    const factory = prepareLiveRuntime();
    const runtime = await factory();
    try {
      const budget = claimLiveBudget(local);
      preparedRuntime = runtime;
      const { close, ...guardedRuntime } = runtime;
      createRuntime = async () => ({ ...guardedRuntime, beforeHttp: budget.beforeHttp });
    } catch (error) { await runtime.close?.(); throw error; }
  }
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
  try {
    const report = await runExperiment({ mode: args.mode, config, signal: controller.signal, checkpoint, ...(createRuntime ? { createRuntime } : {}) });
    console.log(`实验 ${report.state}；真实 HTTP ${report.httpCalls}；模拟传输 ${report.simulatedCalls}。报告已保存到 .local/poi-union-v1/reports/ 最新对应模式目录。`);
    if (report.state === "stopped") process.exitCode = 1;
  } finally { process.off("SIGINT", stop); process.off("SIGTERM", stop); await preparedRuntime?.close?.(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error("实验停止：配置、预算锁、存储或运行环境检查失败；未输出原始异常。不要删除预算锁重跑 Live。"); process.exitCode = 1; });
}
