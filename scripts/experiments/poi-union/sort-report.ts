import { CATEGORIES } from "../../../src/amap/categories.js";
import { FIXED, requested } from "./model.js";
import type { Report, Result } from "./report.js";

export function sortMetrics(row: Result) {
  if (!row.stats || row.outcome !== "success") return null;
  const { perCategory, returnedPois, rawTypecodes } = row.stats;
  const covered = row.trial.categories.filter(k => perCategory[k] > 0);
  const percent = (n: number, total: number) => total ? Math.round(10000 * n / total) / 100 : 0;
  return {
    confirmedCategories: covered.length,
    confirmedCoveragePercent: percent(covered.length, row.trial.categories.length),
    missingConfirmedCategories: row.trial.categories.filter(k => perCategory[k] === 0),
    largestConfirmedCategoryPercent: percent(Math.max(0, ...Object.values(perCategory)), returnedPois),
    largestRawTypecodePercent: percent(Math.max(0, ...Object.entries(rawTypecodes).filter(([code]) => /^\d{6}$/.test(code)).map(([, n]) => n)), returnedPois),
  };
}

export function sortMarkdown(report: Report): string {
  const lines = ["# Nearby POI 联合查询：distance / weight 小对照 V1", "",
    `模式：${report.mode}；状态：${report.state}；时间：${report.generatedAt}。`, "",
    `三个地点各执行 distance、weight 一次，共 ${report.plannedCalls} 项，上限 ${report.hardLimit}；实际 HTTP ${report.httpCalls}；模拟 ${report.simulatedCalls}；未执行 ${report.skippedTrials}。`, "",
    `固定全部 10 类、半径 ${report.radiusMeters}m、${FIXED.endpoint}、page_size=25、page_num=1、show_fields=business。仅改变 sortrule。`, "",
    "顺序：site-1 distance→weight；site-2 weight→distance；site-3 distance→weight。串行，后续请求间隔 500ms，无重试、翻页或额外查询。按用户授权只用本地预算，不执行 PostgreSQL 准入或额度更新。", "",
    `请求分类：${requested(CATEGORIES.map(c => c.key)).map(c => `${c.label}(${c.typecodes.join("/")})`).join("；")}。`, "",
    "## 逐项观测及推导指标", "",
    "| 地点 | 排序 | 结果 | HTTP/业务状态 | 安全错误码/infocode | HTTP/模拟数 | 总耗时 ms | 本地许可/间隔 ms | 响应 ms | POI | 明确类别/10 | 头部明确类别占比 | 头部原始编码占比 | 未确认POI | 达25条 |",
    "| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |"];
  for (const r of report.results) {
    const m = sortMetrics(r);
    lines.push(`| ${r.trial.siteId} | ${r.trial.sortRule} | ${r.outcome} | ${r.httpStatus ?? "—"}/${r.businessStatus} | ${r.errorCode ?? "—"}/${r.infocode ?? "—"} | ${r.httpCalls}/${r.simulatedCalls} | ${r.elapsedMs ?? "—"} | ${r.admissionMs ?? "—"} | ${r.responseMs ?? "—"} | ${r.stats?.returnedPois ?? "—"} | ${m?.confirmedCategories ?? "—"} | ${m ? m.largestConfirmedCategoryPercent + "%" : "—"} | ${m ? m.largestRawTypecodePercent + "%" : "—"} | ${r.stats?.unconfirmedCount ?? "—"} | ${r.stats ? r.stats.reachedPageCap ? "是" : "否" : "—"} |`);
  }
  lines.push("", "## 同地点配对比较（推导）", "", "| 地点 | 明确类别 distance→weight | 覆盖变化百分点 | 响应变化 ms（weight-distance） |", "| --- | --- | ---: | ---: |");
  for (const site of ["site-1", "site-2", "site-3"]) {
    const d = report.results.find(r => r.trial.siteId === site && r.trial.sortRule === "distance");
    const w = report.results.find(r => r.trial.siteId === site && r.trial.sortRule === "weight");
    const dm = d && sortMetrics(d), wm = w && sortMetrics(w);
    lines.push(`| ${site} | ${dm && wm ? dm.confirmedCategories + "→" + wm.confirmedCategories : "—"} | ${dm && wm ? (wm.confirmedCoveragePercent - dm.confirmedCoveragePercent).toFixed(2) : "—"} | ${dm && wm && d?.responseMs != null && w?.responseMs != null ? (w.responseMs - d.responseMs).toFixed(2) : "—"} |`);
  }
  lines.push("", "## 类别数量（仅配置明确归属）", "", `| 地点/排序 | ${CATEGORIES.map(c => c.label).join(" | ")} |`, `| --- | ${CATEGORIES.map(() => "---:").join(" | ")} |`);
  for (const r of report.results) lines.push(`| ${r.trial.siteId}/${r.trial.sortRule} | ${CATEGORIES.map(c => r.stats?.perCategory[c.key] ?? "—").join(" | ")} |`);
  lines.push("", "## 原始编码及未确认项", "");
  for (const r of report.results.filter(r => r.stats)) lines.push(`- ${r.trial.siteId}/${r.trial.sortRule} 原始编码：${JSON.stringify(r.stats!.rawTypecodes)}；未确认编码：${JSON.stringify(r.stats!.unconfirmedTypecodes)}`);
  lines.push("", "## 解释与限制", "",
    "- live 为本次真实观测；dry 为计划；mock 为合成数据及本机耗时。completed 表示遍历结束，单项成败见 outcome。普通上游失败记录后继续，认证、限额、取消和本地存储/预算错误停止。",
    "- 每地点、每排序仅一次，共六次。交替顺序只能部分控制顺序影响；连接复用、缓存及时间变化均可能影响耗时。此次是探索性配对，普遍最优排序仍待更多数据。",
    "- 只改排序，未运行独立类别查询；单类别对照保留率和真实账单尚未测量。两种排序均为每地点一次请求，实际HTTP次数分别统计。",
    "- 明确类别数和占比是基于 CATEGORIES 精确编码归属的推导。父子编码及未知编码保留原始聚合并单列，缺失的明确类别可能包含未确认子码。头部明确类别占比的分母为全部返回POI，因此未知编码会影响解释；另列头部原始编码占比作补充。",
    "- 只读取第一页，25条触顶用于观察共享页容量；覆盖变化本身没有说明高德内部召回/排序公式或附近全部类别供给。",
    "- responseMs 从发出HTTP到响应读取/校验完成；总耗时包含本地许可及500ms间隔。报告仅保存必要聚合，无敏感坐标、Key、连接串、完整URL或原始POI。", "");
  return lines.join("\n");
}
