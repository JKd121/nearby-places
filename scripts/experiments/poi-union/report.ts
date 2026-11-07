import { CATEGORIES } from "../../../src/amap/categories.js";
import { FIXED, MAX_CALLS, requested, type Mode, type Statistics, type Trial } from "./model.js";
import { sortMarkdown, sortMetrics } from "./sort-report.js";

export interface Result {
  trial: Trial;
  outcome: "planned" | "success" | "failed";
  admission: "not-attempted" | "granted" | "failed" | "local-budget";
  httpCalls: number;
  simulatedCalls: number;
  httpStatus: number | null;
  businessStatus: "1" | "non-success" | "unavailable";
  infocode: string | null;
  errorCode: string | null;
  errorAction: string | null;
  elapsedMs: number | null;
  admissionMs: number | null;
  responseMs: number | null;
  stats: Statistics | null;
}
export interface Report {
  version: "poi-union-v1" | "poi-union-sort-v1";
  executionControl?: "local-exploration";
  mode: Mode;
  generatedAt: string;
  radiusMeters: number;
  state: "planned" | "running" | "completed" | "stopped";
  plannedCalls: number;
  hardLimit: number;
  httpCalls: number;
  simulatedCalls: number;
  skippedTrials: number;
  results: Result[];
}

/** Explicit allowlist: never serialize config, URLs, errors, Response or POI objects. */
export function publicReport(report: Report) {
  return {
    version: report.version, mode: report.mode, generatedAt: report.generatedAt, radiusMeters: report.radiusMeters,
    parameters: report.version === "poi-union-sort-v1" ? { ...FIXED, sortRule: "per-trial", sortRules: ["distance", "weight"] } : FIXED,
    state: report.state, plannedCalls: report.plannedCalls, hardLimit: report.hardLimit,
    httpCalls: report.httpCalls, simulatedCalls: report.simulatedCalls, skippedTrials: report.skippedTrials,
    executionControl: report.executionControl ?? (report.mode === "live" ? "postgres-admission" : report.mode === "mock" ? "mock" : "planned"),
    classification: "Exact configured codes only. Parent/child or unknown codes remain unconfirmed; no prefix inference.",
    results: report.results.map(({ trial, ...result }) => ({ ...result, experimentId: trial.id, siteId: trial.siteId,
      densityHypothesis: trial.density, group: trial.group, requested: requested(trial.categories),
      ...(trial.sortRule ? { sortRule: trial.sortRule } : {}),
      ...(report.version === "poi-union-sort-v1" ? { derived: sortMetrics({ trial, ...result }) } : {}) })),
  };
}

export function markdown(report: Report): string {
  if (report.version === "poi-union-sort-v1") return sortMarkdown(report);
  const lines = ["# Nearby POI 2.0 联合查询隔离实验 V1", "", `模式：${report.mode}；状态：${report.state}；生成时间：${report.generatedAt}`, "",
    `计划 ${report.plannedCalls} 次，上限 ${MAX_CALLS}；实际 HTTP ${report.httpCalls} 次；模拟传输 ${report.simulatedCalls} 次；未执行 ${report.skippedTrials} 项。`, "",
    `固定参数：${FIXED.endpoint}；半径 ${report.radiusMeters} m；page_size=25；page_num=1；sortrule=distance；show_fields=business。`, "",
    "A：酒店/商场/火锅（住宿、购物、餐饮）；B：A + 健身房/公交站（娱乐、交通）；C：现有全部 10 类。每地点依次 A/B/C，不自动翻页、不重试。", "",
    "## 请求类别与编码", "", "| 组 | 请求类别及 typecode |", "| --- | --- |"];
  for (const group of ["A", "B", "C"] as const) {
    const trial = report.results.find(r => r.trial.group === group)?.trial;
    if (trial) lines.push(`| ${group} | ${requested(trial.categories).map(c => `${c.label}: ${c.typecodes.join("/")}`).join("；")} |`);
  }
  if (report.executionControl) lines.splice(4, 0, "执行方式：本地探索；已按用户授权跳过 PostgreSQL 准入及数据库预热。local-budget 表示本地次数控制通过，未执行数据库额度扣减。普通上游失败记入报告后继续下一项；认证、限额、取消及本地存储错误停止。completed 表示计划遍历结束，逐条 outcome 表示请求成功或失败。", "");
  lines.push("", "## 逐项观测", "", "| 地点 | 组 | 类数 | 结果 | HTTP | 业务状态 | 安全错误码 | 准入 | HTTP/模拟数 | 总耗时 ms | 准入 ms | 响应 ms | POI | 未确认 | 达25条 |", "| --- | --- | ---: | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const r of report.results) lines.push(`| ${r.trial.siteId} | ${r.trial.group} | ${r.trial.categories.length} | ${r.outcome} | ${r.httpStatus ?? "—"} | ${r.businessStatus} | ${r.errorCode ?? "—"} | ${r.admission} | ${r.httpCalls}/${r.simulatedCalls} | ${r.elapsedMs ?? "—"} | ${r.admissionMs ?? "—"} | ${r.responseMs ?? "—"} | ${r.stats?.returnedPois ?? "—"} | ${r.stats?.unconfirmedCount ?? "—"} | ${r.stats ? r.stats.reachedPageCap ? "是" : "否" : "—"} |`);
  lines.push("", "## 类别分布（仅明确编码归属）", "", `| 地点/组 | ${CATEGORIES.map(c => c.label).join(" | ")} |`, `| --- | ${CATEGORIES.map(() => "---:").join(" | ")} |`);
  for (const r of report.results) lines.push(`| ${r.trial.siteId}/${r.trial.group} | ${CATEGORIES.map(c => r.stats?.perCategory[c.key] ?? "—").join(" | ")} |`);
  lines.push("", "## 原始 typecode 聚合与未确认项", "");
  for (const r of report.results.filter(r => r.stats)) lines.push(`- ${r.trial.siteId}/${r.trial.group} 原始编码：${JSON.stringify(r.stats!.rawTypecodes)}；未确认：${JSON.stringify(r.stats!.unconfirmedTypecodes)}`);
  lines.push("", "## 推导指标（成功记录）", "", "| 组 | 成功样本 | 平均总耗时 ms | 平均响应 ms | 平均已确认请求类别覆盖率 | 达25条样本 |", "| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const group of ["A", "B", "C"] as const) {
    const rows = report.results.filter(r => r.trial.group === group && r.outcome === "success");
    const mean = (values: number[]) => values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2) : "—";
    lines.push(`| ${group} | ${rows.length} | ${mean(rows.flatMap(r => r.elapsedMs === null ? [] : [r.elapsedMs]))} | ${mean(rows.flatMap(r => r.responseMs === null ? [] : [r.responseMs]))} | ${mean(rows.map(r => 100 * r.trial.categories.filter(k => r.stats!.perCategory[k] > 0).length / r.trial.categories.length))}% | ${rows.filter(r => r.stats!.reachedPageCap).length} |`);
  }
  lines.push("", "## 解释边界", "",
    "- dry 为计划，mock 全部是模拟数据和本机耗时；只有 live 才是真实观测。密度是人工选址假设，尚未由接口验证。",
    "- 总耗时从准入前至响应校验完成；准入耗时包含等待；响应耗时从 HTTP 调用开始至读取/校验完成。无 HTTP 时为 null，不把等待当接口延迟。",
    "- HTTP 状态在收到响应头时记录，即使随后读取失败。业务状态 1 为真实成功值；non-success 表示统一传输层拒绝业务状态（不保留任意原始状态文本）；unavailable 表示未能确认。高德安全 infocode 见 JSON。",
    "- 分类只使用 CATEGORIES 的 acceptedTypecodes（存在时）或 types 明确编码。父编码查询可能返回子编码，现有配置没有完整父子映射；全部非精确匹配保持未确认，不使用前缀猜测。缺失/异常 typecode 使用固定桶。",
    "- 类别覆盖率是有已确认 POI 的请求类别数 / 请求类别数，属于推导的保守指标；未知编码可能低估。0 条不代表附近没有该类别。",
    "- 达到 25 条只表明第一页触顶，可提示分页竞争风险，不能证明类别被挤出或比较总供给。没有独立类别对照，未测得相对独立查询的 POI 保留率。",
    "- 计划样本量仅 9 次（每组 3 次）；失败后可能更少。不能证明某个类别数量上限具有普遍最优性。固定执行顺序、时间波动和地点差异均可能影响比较。",
    "- 准入 granted 只表示本次取得许可；实际 HTTP 单独计数。额度可能已扣但请求未发出，不退款。未执行项不补跑。报告只保存必要聚合，不含坐标、Key、连接串、完整 URL 或原始 POI。", "");
  if (report.executionControl) lines.splice(lines.length - 1, 0, "- 本地探索的总耗时包含本地检查与 500 ms 请求间隔，admissionMs 为本地许可检查及该间隔时间；responseMs 为高德响应读取和校验时间。本轮没有独立类别对照，实际费用和相对独立查询的加速均未测量。");
  return lines.join("\n");
}
