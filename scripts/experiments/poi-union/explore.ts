import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { abortable, throwIfAborted } from "../../../src/amap/request-context.js";
import { parseArgs } from "./cli.js";
import { parseConfig, SYNTHETIC_CONFIG } from "./model.js";
import { mockRuntime, runExperiment, type Runtime } from "./runner.js";
import { reportWriter } from "./storage.js";
import { claimExplorationBudget } from "./exploration-budget.js";

export function parseExplorationArgs(args: string[]) {
  if (args.includes("--authorize-live-9")) throw new Error("Use local exploration authorization");
  return parseArgs(args.map(a => a === "--authorize-local-live-9" ? "--authorize-live-9" : a));
}

/** No server, Prisma or database imports. The shared transport still owns every HTTP call. */
export function localExplorationRuntime(key: string, fetchImpl: typeof fetch, paceMs = 500): Runtime {
  if (!key.trim() || !Number.isSafeInteger(paceMs) || paceMs < 0) throw new Error("Invalid local runtime");
  let attempted = false;
  return { key, fetchImpl, beforeAttempt: async (operation, signal) => {
    if (operation !== "nearby") throw new Error("Unexpected operation");
    if (attempted && paceMs > 0) await abortable(new Promise<void>(done => setTimeout(done, paceMs)), signal);
    throwIfAborted(signal);
    attempted = true;
    return { assertValid() { throwIfAborted(signal); } };
  } };
}

async function main() {
  const args = parseExplorationArgs(process.argv.slice(2));
  const config = args.configPath ? parseConfig(JSON.parse(readFileSync(args.configPath, "utf8"))) : SYNTHETIC_CONFIG;
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  if (realpathSync(fileURLToPath(import.meta.url)) !== realpathSync(join(root, "dist/scripts/experiments/poi-union/explore.js")) || JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name !== "amap-nearby-spike") throw new Error("Use original checkout");
  const directory = join(root, ".local", "poi-union-v1");
  const checkpoint = reportWriter(join(directory, "reports", `local-${args.mode}-${Date.now()}-${randomUUID()}`));
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
  try {
    let runtime: Runtime | undefined;
    if (args.mode === "live") {
      runtime = localExplorationRuntime(process.env.AMAP_WEB_SERVICE_KEY ?? "", globalThis.fetch);
      const budget = claimExplorationBudget(directory);
      runtime.beforeHttp = budget.beforeHttp;
    }
    const report = await runExperiment({ mode: args.mode, executionControl: "local-exploration", config, signal: controller.signal, checkpoint,
      createRuntime: async () => runtime ?? mockRuntime(config) });
    console.log(`本地探索 ${report.state}；真实 HTTP ${report.httpCalls}；模拟 ${report.simulatedCalls}；成功 ${report.results.filter(r => r.outcome === "success").length}；失败 ${report.results.filter(r => r.outcome === "failed").length}。聚合报告已保存到 .local/poi-union-v1/reports/ 对应 local 模式目录。`);
    if (report.state === "stopped" || report.results.some(r => r.outcome === "failed")) process.exitCode = 1;
  } finally { process.off("SIGINT", stop); process.off("SIGTERM", stop); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error("本地探索停止：授权、配置、预算或存储检查失败；原始异常已隐藏，预算锁保持原状。"); process.exitCode = 1; });
}
