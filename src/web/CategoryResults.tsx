import { useId, useState } from "react";
import type { CategoryKey, CategorySearchResult } from "../amap/types";
import type { SearchProgress, SearchResponse } from "../search/contracts";
import { publicSearchErrorMessage } from "../errors/classify";
import type { SortMode } from "../search/sort";
import { categoryLabel, PlaceList } from "./SearchPanels";
import { Badge, EmptyState, Feedback } from "./ui/Feedback";
import { canRequestSecondProviderPage, getAllowedSortModes, getCategoryCounts, getEmptyStateMessage, getInitialVisibleCount, getNextVisibleCount, sortPlacesForFilter } from "./logic";
import s from "./search-workspace.module.css";

function sortLabel(mode: SortMode): string { return { "distance-asc": "距离最近", "rating-desc": "评分最高", "cost-asc": "消费最低", "cost-desc": "消费最高" }[mode]; }

interface ResultsProps {
  categoryIds: readonly CategoryKey[];
  response: SearchResponse | null;
  progress: SearchProgress | null;
  searching: boolean;
  interrupted: boolean;
  loadingCategory: CategoryKey | null;
  pageErrors: Partial<Record<CategoryKey, string>>;
  onLoadPage: (categoryId: CategoryKey) => Promise<number | null>;
}

export function CategoryResults(props: ResultsProps) {
  const counts = getCategoryCounts(props.response?.categories ?? []);
  const settled = props.response?.categories.length ?? 0;
  return <div className={s.resultsBody}>
    <div className={s.resultMeta} role="status" aria-live="polite"><span>{props.searching ? `已返回 ${settled} / ${props.categoryIds.length} 类 · 其余类别继续搜索中` : `已返回 ${settled} / ${props.categoryIds.length} 类`}</span><Badge tone={props.searching ? "accent" : counts.failed || counts.skipped || props.interrupted ? "warning" : "success"}>{counts.completed} 类完成{counts.failed > 0 ? ` · ${counts.failed} 类失败` : ""}{counts.skipped > 0 ? ` · ${counts.skipped} 类未搜索` : ""}</Badge></div>
    {props.response?.termination && <Feedback tone="warning" title="搜索提前结束">{publicSearchErrorMessage(props.response.termination.code)}；已完成的类别仍可查看。</Feedback>}
    <div className={s.categoryResults}>{props.categoryIds.map(categoryId => <CategoryResultPanel key={categoryId}
      categoryId={categoryId} result={props.response?.categories.find(item => item.category.key === categoryId)}
      active={props.progress?.active.includes(categoryId) ?? false} searching={props.searching} interrupted={props.interrupted}
      pageLoading={props.loadingCategory === categoryId} pageDisabled={props.searching || props.loadingCategory !== null}
      pageError={props.pageErrors[categoryId]} onLoadPage={props.onLoadPage} />)}</div>
  </div>;
}

function CategoryResultPanel({ categoryId, result, active, searching, interrupted, pageLoading, pageDisabled, pageError, onLoadPage }: {
  categoryId: CategoryKey; result: CategorySearchResult | undefined; active: boolean; searching: boolean; interrupted: boolean;
  pageLoading: boolean; pageDisabled: boolean; pageError: string | undefined; onLoadPage: ResultsProps["onLoadPage"];
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("distance-asc");
  const [visibleCount, setVisibleCount] = useState(getInitialVisibleCount(categoryId));
  const places = sortPlacesForFilter(result?.places ?? [], sortMode, categoryId);
  const canLoadMore = visibleCount < places.length;
  const canFetchPage = canRequestSecondProviderPage(result);
  const status = result ? { success: "已完成", empty: "无结果", error: "搜索失败", skipped: "未执行" }[result.status]
    : interrupted ? "搜索中断" : active && searching ? "搜索中…" : "等待搜索";
  const tone = result?.status === "success" || result?.status === "empty" ? "success"
    : result?.status === "error" || (!result && interrupted) ? "error" : active || result?.status === "skipped" ? "warning" : "neutral";
  async function loadPage() {
    const total = await onLoadPage(categoryId);
    if (total !== null) setVisibleCount(current => getNextVisibleCount(categoryId, current, total));
  }
  return <section className={s.categoryResult} data-active={active && searching && !result} aria-labelledby={`${id}-heading`}>
    <h3 id={`${id}-heading`} className={s.categoryResultHeading}><button type="button" className={s.categoryResultToggle} aria-expanded={expanded} aria-controls={`${id}-body`} onClick={() => setExpanded(current => !current)}>
      <span className={s.categoryResultName}>{categoryLabel(categoryId)}</span>
      {result && <span className={s.categoryResultCount}>{result.places.length} 个地点</span>}
      <Badge tone={tone}>{status}</Badge><svg className={s.categoryChevron} data-expanded={expanded} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button></h3>
    <div id={`${id}-body`} hidden={!expanded} className={s.categoryResultBody}>
      {!result && <p className={s.categoryWaiting}>{interrupted ? "本类搜索已中断，请重新搜索。" : active ? "正在搜索附近地点，返回后会显示在这里。" : "等待搜索此类别…"}</p>}
      {result?.status === "error" && <Feedback tone="error" title="该类别暂时无法搜索">{result.error?.message ?? "请稍后重新搜索。"}</Feedback>}
      {result?.status === "skipped" && <Feedback tone="warning" title="该类别尚未搜索">搜索提前结束，该类别未执行。</Feedback>}
      {result?.status === "empty" && <EmptyState title="当前类别没有结果">{getEmptyStateMessage(categoryId)}</EmptyState>}
      {result?.status === "success" && <>
        <div className={s.categorySortRow}><label className={s.sort}><span>{categoryLabel(categoryId)}排序</span><select value={sortMode} onChange={event => setSortMode(event.target.value as SortMode)}>{getAllowedSortModes(categoryId).map(mode => <option value={mode} key={mode}>{sortLabel(mode)}</option>)}</select></label></div>
        <PlaceList places={places.slice(0, visibleCount)} />
        <div className={s.listFooter}>
          {canLoadMore && <button type="button" onClick={() => setVisibleCount(current => getNextVisibleCount(categoryId, current, places.length))}>加载更多（已显示 {Math.min(visibleCount, places.length)}/{places.length}）</button>}
          {!canLoadMore && (canFetchPage || pageLoading) && <button type="button" onClick={() => void loadPage()} disabled={pageDisabled}>{pageLoading ? "正在获取更多地点…" : searching ? "搜索结束后可获取更多" : "获取更多附近结果"}</button>}
          {pageError && <Feedback tone="error" title="更多地点加载失败" action={<button type="button" onClick={() => void loadPage()} disabled={pageDisabled}>重试加载</button>}>{pageError}</Feedback>}
          {!canLoadMore && !canFetchPage && !pageLoading && !pageError && <p className={s.muted}>{result.page?.pageNumber === 2 && result.page.returnedCount === result.page.pageSize ? `当前类别最多展示两页，已显示 ${places.length} 个结果。` : `已显示全部 ${places.length} 个结果。`}</p>}
        </div>
      </>}
    </div>
  </section>;
}
