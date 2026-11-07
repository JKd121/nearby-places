import { readFileSync, mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, realpathSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { parseArgs } from "./cli.js";
import { parseConfig, SORT_COMPARISON_CALLS, SYNTHETIC_CONFIG } from "./model.js";
import { localExplorationRuntime } from "./explore.js";
import { runExperiment, type Runtime } from "./runner.js";
import { reportWriter } from "./storage.js";

export function parseSortArgs(args: string[]) {
  if (args.includes("--authorize-live-9")) throw new Error("Use sorting round authorization");
  return parseArgs(args.map(a => a === "--authorize-sort-live-6" ? "--authorize-live-9" : a));
}

/** Separate user-authorized six-call round. Never reads or resets the preceding V1 budget. */
export function claimSortBudget(directory: string) {
  mkdirSync(directory, { recursive: true });
  const fd = openSync(join(directory, "sort-comparison.lock"), "wx", 0o600);
  try { writeFileSync(fd, JSON.stringify({ version: "poi-union-sort-v1", reserved: SORT_COMPARISON_CALLS }) + "\n"); fsyncSync(fd); }
  finally { closeSync(fd); }
  let calls = 0;
  return { beforeHttp() {
    if (calls >= SORT_COMPARISON_CALLS) throw new Error("Sorting round budget exhausted");
    const journal = openSync(join(directory, "sort-attempts.jsonl"), "a", 0o600);
    try { writeFileSync(journal, JSON.stringify({ attempt: ++calls }) + "\n"); fsyncSync(journal); }
    finally { closeSync(journal); }
  } };
}

async function main() {
  const args = parseSortArgs(process.argv.slice(2));
  const config = args.configPath ? parseConfig(JSON.parse(readFileSync(args.configPath, "utf8"))) : SYNTHETIC_CONFIG;
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  if (realpathSync(fileURLToPath(import.meta.url)) !== realpathSync(join(root, "dist/scripts/experiments/poi-union/sort-comparison.js")) || JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name !== "amap-nearby-spike") throw new Error("Use original checkout");
  const local = join(root, ".local", "poi-union-v1");
  const checkpoint = reportWriter(join(local, "reports", `sort-${args.mode}-${Date.now()}-${randomUUID()}`));
  let runtime: Runtime | undefined;
  if (args.mode === "live") {
    runtime = localExplorationRuntime(process.env.AMAP_WEB_SERVICE_KEY ?? "", globalThis.fetch);
    const budget = claimSortBudget(join(local, "sort-comparison-v1"));
    runtime.beforeHttp = budget.beforeHttp;
  }
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
  try {
    const report = await runExperiment({ mode: args.mode, design: "sort-comparison", executionControl: "local-exploration", config, signal: controller.signal, checkpoint,
      ...(runtime ? { createRuntime: async () => runtime! } : {}) });
    console.log(`排序对照 ${report.state}；真实 HTTP ${report.httpCalls}；模拟 ${report.simulatedCalls}；成功 ${report.results.filter(r => r.outcome === "success").length}；报告已保存到 .local/poi-union-v1/reports/ 对应 sort 模式目录。`);
    if (report.state === "stopped" || report.results.some(r => r.outcome === "failed")) process.exitCode = 1;
  } finally { process.off("SIGINT", stop); process.off("SIGTERM", stop); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error("排序对照停止：授权、配置、预算或存储检查失败；原始异常已隐藏，预算记录保留。"); process.exitCode = 1; });
}
