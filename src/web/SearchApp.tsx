"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import WorkspaceShell, { type WorkspaceView } from "./ui/WorkspaceShell";
import { Badge, EmptyState, Feedback, LoadingState } from "./ui/Feedback";
import { Icon } from "./ui/icons";
import { CandidateList, CategorySelector, HistoryView, PersonalCenter, PlaceList, categoryLabel } from "./SearchPanels";
import s from "./search-workspace.module.css";
import { useSearchHistory } from "./useSearchHistory";
import type { SearchHistoryItem, SearchHistoryInput } from "./search-history-store";
import { isSearchHistoryItem } from "./search-history-store";
import { copyConfirmedLocation } from "../history/validation";
import type { CategoryKey, CategorySearchResult, GeocodedPlace, Place } from "../amap/types";
import type { LocationCandidate } from "../location/types";
import type { SearchRadius, SearchResponse, SearchSecondPageResponse } from "../search/contracts";
import { isCategoryCompleted } from "../search/status";
import { publicSearchErrorMessage } from "../errors/classify";
import type { SortMode } from "../search/sort";
import {
  ALLOWED_RADIUS_METERS, ALL_CATEGORY_IDS,
  ensureValidSortMode, getAllowedSortModes,
  canRequestSecondProviderPage, getAvailableFilters, getCategoryResult,
  getCategoryCounts,
  getInitialVisibleCount, getNextVisibleCount, getPlacesForFilter, mergeProviderPageResult,
  resetSearchView, resolveProviderPageCategory, selectAllCategories, sortPlacesForFilter,
  getEmptyStateMessage, type ActiveFilter,
} from "./logic";

type Phase = "initial" | "resolving" | "needs-confirmation" | "resolved" | "not-found" | "searching" | "results" | "resolve-error" | "search-error";
interface PublicApiError { message?: string; }
interface ResolutionApiResponse { status?: "confirmed" | "needs_confirmation" | "not_found"; location?: LocationCandidate; candidates?: LocationCandidate[]; error?: PublicApiError; }

type HistoryReplaySnapshot = {
  query: string;
  categoryIds: CategoryKey[];
  radiusMeters: SearchRadius;
};

async function readJson(response: Response): Promise<unknown> { try { return await response.json(); } catch { return null; } }
function sortLabel(mode: SortMode): string { return { "distance-asc": "距离最近", "rating-desc": "评分最高", "cost-asc": "消费最低", "cost-desc": "消费最高" }[mode]; }

export default function SearchApp() {
  const [query, setQuery] = useState("");
  const [resolvedLocation, setResolvedLocation] = useState<LocationCandidate | null>(null);
  const [resolvedQuery, setResolvedQuery] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<LocationCandidate[]>([]);
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  const [phase, setPhase] = useState<Phase>("initial");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [publicError, setPublicError] = useState<string | null>(null);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<CategoryKey[]>(selectAllCategories);
  const [radiusMeters, setRadiusMeters] = useState<SearchRadius>(3_000);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("distance-asc");
  const [visibleCount, setVisibleCount] = useState(getInitialVisibleCount("all"));
  const [loadingProviderCategory, setLoadingProviderCategory] = useState<CategoryKey | null>(null);
  const [providerPageErrors, setProviderPageErrors] = useState<Partial<Record<CategoryKey, string>>>({});
  const history = useSearchHistory();
  const [view, setView] = useState<WorkspaceView>("explore");
  const [conditionsOpen, setConditionsOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const availableFilters = useMemo(() => getAvailableFilters(response), [response]);
  const activeResult = useMemo(() => getCategoryResult(response, activeFilter), [response, activeFilter]);
  const activePlaces = useMemo(() => getPlacesForFilter(response, activeFilter), [response, activeFilter]);
  const allowedSortModes = useMemo(() => getAllowedSortModes(activeFilter, selectedCategoryIds), [activeFilter, selectedCategoryIds]);
  const effectiveSortMode = useMemo(() => ensureValidSortMode(sortMode, activeFilter, selectedCategoryIds), [sortMode, activeFilter, selectedCategoryIds]);
  const sortedPlaces = useMemo(() => sortPlacesForFilter(activePlaces, effectiveSortMode, activeFilter, selectedCategoryIds), [activePlaces, effectiveSortMode, activeFilter, selectedCategoryIds]);
  const visiblePlaces = useMemo(() => sortedPlaces.slice(0, visibleCount), [sortedPlaces, visibleCount]);
  const counts = useMemo(() => getCategoryCounts(response?.categories ?? []), [response]);
  const successfulCount = counts.completed;
  const failedCount = counts.failed;
  const canLoadMore = visiblePlaces.length < sortedPlaces.length;
  const providerPageCategory = useMemo(() => resolveProviderPageCategory(activeFilter, selectedCategoryIds), [activeFilter, selectedCategoryIds]);
  const providerPageResult = useMemo(() => providerPageCategory ? getCategoryResult(response, providerPageCategory) : null, [response, providerPageCategory]);
  const canRequestProviderPage = !canLoadMore && loadingProviderCategory === null && canRequestSecondProviderPage(providerPageResult);
  const canAnyCategoryRequestProviderPage = useMemo(() => response?.categories.some(canRequestSecondProviderPage) ?? false, [response]);

  function invalidateRequests(): void {
    requestId.current += 1;
    activeRequest.current?.abort();
    activeRequest.current = null;
  }

  function beginRequest(): AbortController {
    invalidateRequests();
    const controller = new AbortController();
    activeRequest.current = controller;
    return controller;
  }

  useEffect(() => () => invalidateRequests(), []);

  function resetView(): void {
    const next = resetSearchView();
    setResponse(null); setActiveFilter(next.activeFilter); setSortMode(next.sortMode); setVisibleCount(next.visibleCount); setPublicError(null); setLoadingProviderCategory(null); setProviderPageErrors({});
  }

  function invalidateLocation(nextQuery: string): void {
    setQuery(nextQuery);
    invalidateRequests();
    setResolvedLocation(null); setResolvedQuery(null); setCandidates([]); setShowAllCandidates(false); setPublicError(null); setPhase("initial"); resetView();
  }

  function clearQuery(): void {
    setView("explore");
    invalidateLocation("");
    inputRef.current?.focus();
  }

  function navigate(next: WorkspaceView): void {
    setView(next);
    if (next === "history") void history.refresh();
  }

  function handleHistoryDelete(id: string, button: HTMLButtonElement): void {
    if (document.activeElement === button) {
      const buttons = Array.from(button.closest("ul")?.querySelectorAll<HTMLButtonElement>("[data-history-delete]") ?? []);
      const index = buttons.indexOf(button);
      const next = buttons[index + 1] ?? buttons[index - 1] ??
        document.querySelector<HTMLButtonElement>('[data-history-entry]');
      next?.focus();
    }
    void history.remove(id);
  }

  function handleHistorySelect(item: SearchHistoryItem): void {
    if (!isSearchHistoryItem(item)) {
      console.warn("Ignoring invalid search history item", item);
      return;
    }

    const replaySnapshot: HistoryReplaySnapshot = {
      query: item.query,
      categoryIds: [...item.categoryIds] as CategoryKey[],
      radiusMeters: item.radiusMeters as SearchRadius,
    };
    const location = copyConfirmedLocation(item.confirmedLocation);

    invalidateRequests();
    setQuery(item.query);
    setSelectedCategoryIds(replaySnapshot.categoryIds);
    setRadiusMeters(replaySnapshot.radiusMeters);
    setResolvedLocation(location);
    setResolvedQuery(item.query.trim());
    setCandidates([]);
    setShowAllCandidates(false);
    resetView();
    setView("explore");
    void searchNearbyForSnapshot(location, replaySnapshot);
  }

  function changeCategories(next: CategoryKey[]): void { invalidateRequests(); setSelectedCategoryIds(next); resetView(); setPhase(resolvedLocation ? "resolved" : "initial"); }

  function changeRadius(next: string): void {
    const value = Number(next) as SearchRadius;
    if (!ALLOWED_RADIUS_METERS.includes(value as (typeof ALLOWED_RADIUS_METERS)[number])) return;
    invalidateRequests(); setRadiusMeters(value); resetView(); setPhase(resolvedLocation ? "resolved" : "initial");
  }

  function resolveLocation(): void {
    if (query.trim()) setSelectedCategoryIds(selectAllCategories());
    void resolveLocationForQuery(query);
  }

  async function resolveLocationForQuery(queryToResolve: string): Promise<void> {
    const trimmed = queryToResolve.trim();
    if (!trimmed) { setPublicError("请先输入地点名称"); setPhase("resolve-error"); return; }
    const controller = beginRequest();
    const currentId = requestId.current;
    setPhase("resolving"); setPublicError(null); resetView(); setResolvedLocation(null); setResolvedQuery(null); setCandidates([]); setShowAllCandidates(false);
    try {
      const result = await fetch("/api/resolve-location", { signal: controller.signal, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: trimmed }) });
      const payload = await readJson(result) as ResolutionApiResponse | null;
      if (controller.signal.aborted || currentId !== requestId.current) return;
      if (!result.ok) throw new Error(payload?.error?.message ?? "地点解析失败");
      if (payload?.status === "needs_confirmation") { setCandidates(payload.candidates ?? []); setPhase("needs-confirmation"); return; }
      if (payload?.status === "not_found") { setPhase("not-found"); return; }
      if (payload?.status !== "confirmed" || !payload.location) {
        throw new Error("地点解析失败");
      }
      setResolvedLocation(payload.location); setResolvedQuery(trimmed); setPhase("resolved");
    } catch (error) {
      if (controller.signal.aborted || currentId !== requestId.current) return;
      setPublicError(error instanceof Error ? error.message : "地点解析失败"); setPhase("resolve-error");
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }

  function confirmCandidate(candidate: LocationCandidate): void {
    invalidateRequests();
    setResolvedLocation(candidate); setResolvedQuery(query.trim()); setCandidates([]); setShowAllCandidates(false); setPublicError(null); resetView(); setPhase("resolved");
    requestAnimationFrame(() => document.getElementById("search-panel-title")?.focus());
  }

  function clearResolved(): void { invalidateRequests(); setResolvedLocation(null); setResolvedQuery(null); setCandidates([]); setShowAllCandidates(false); resetView(); setPublicError(null); setPhase("initial"); }

  async function searchNearby(): Promise<void> {
    if (!resolvedLocation || selectedCategoryIds.length === 0) return;
    await searchNearbyForSnapshot(resolvedLocation, {
      query: resolvedQuery ?? query.trim(),
      categoryIds: [...selectedCategoryIds],
      radiusMeters,
    });
  }

  async function searchNearbyForSnapshot(
    location: LocationCandidate,
    snapshot: HistoryReplaySnapshot,
  ): Promise<void> {
    if (snapshot.categoryIds.length === 0) return;
    const controller = beginRequest();
    const currentId = requestId.current;
    setPhase("searching"); setPublicError(null);
    try {
      const searchLocation: GeocodedPlace = { query: snapshot.query.trim(), formattedAddress: location.address ?? location.name, province: null, city: location.city, district: location.district, level: location.placeType, longitude: location.location.longitude, latitude: location.location.latitude };
      const historyInput: SearchHistoryInput = {
        query: searchLocation.query,
        categoryIds: [...snapshot.categoryIds],
        radiusMeters: snapshot.radiusMeters,
        confirmedLocation: copyConfirmedLocation(location),
      };
      const result = await fetch("/api/search", { signal: controller.signal, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ center: { longitude: location.location.longitude, latitude: location.location.latitude }, resolvedLocation: searchLocation, categoryIds: snapshot.categoryIds, radiusMeters: snapshot.radiusMeters }) });
      const payload = await readJson(result) as (SearchResponse & { error?: PublicApiError }) | null;
      if (controller.signal.aborted || currentId !== requestId.current) return;

if (!result.ok || !payload?.categories) {
  throw new Error(
    payload?.error?.message ?? "周边搜索失败",
  );
}

setResponse(payload);
setActiveFilter("all");
setSortMode("distance-asc");
setVisibleCount(getInitialVisibleCount("all"));
setPhase("results");

const hasSuccessfulCategory =
  payload.categories.some(
    (category) => isCategoryCompleted(category.status),
  );

if (hasSuccessfulCategory) {
  void history.save(historyInput);
}
    } catch (error) {
      if (controller.signal.aborted || currentId !== requestId.current) return;
      setPublicError(error instanceof Error ? error.message : "周边搜索失败"); setPhase("search-error");
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }

  function changeFilter(nextFilter: ActiveFilter): void {
    if (!availableFilters.includes(nextFilter)) return;
    setActiveFilter(nextFilter); setSortMode(ensureValidSortMode(sortMode, nextFilter, selectedCategoryIds)); setVisibleCount(getInitialVisibleCount(nextFilter));
  }

  function changeSort(nextMode: SortMode): void { if (allowedSortModes.includes(nextMode)) setSortMode(nextMode); }
  function loadMore(): void { setVisibleCount(getNextVisibleCount(activeFilter, visibleCount, sortedPlaces.length)); }

  async function loadProviderPage(): Promise<void> {
    const categoryId = providerPageCategory;
    if (!response || !categoryId || !canRequestSecondProviderPage(providerPageResult) || loadingProviderCategory !== null) return;
    const controller = beginRequest();
    const currentId = requestId.current;
    setLoadingProviderCategory(categoryId);
    setProviderPageErrors((current) => {
      const { [categoryId]: _cleared, ...remaining } = current;
      return remaining;
    });
    try {
      const result = await fetch("/api/search/page", { signal: controller.signal, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ center: { longitude: response.resolvedLocation.longitude, latitude: response.resolvedLocation.latitude }, categoryId, radiusMeters }) });
      const payload = await readJson(result) as (SearchSecondPageResponse & { error?: PublicApiError }) | null;
      if (controller.signal.aborted || currentId !== requestId.current) return;
      if (!result.ok || !payload?.page || payload.categoryId !== categoryId) throw new Error(payload?.error?.message ?? "获取更多地点失败");
      const nextResponse = mergeProviderPageResult(response, categoryId, payload.page);
      const nextTotal = sortPlacesForFilter(getPlacesForFilter(nextResponse, activeFilter), effectiveSortMode, activeFilter, selectedCategoryIds).length;
      setResponse(nextResponse);
      setVisibleCount((current) => getNextVisibleCount(activeFilter, current, nextTotal));
    } catch (error) {
      if (controller.signal.aborted || currentId !== requestId.current) return;
      setProviderPageErrors((current) => ({ ...current, [categoryId]: error instanceof Error ? error.message : "获取更多地点失败" }));
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
      if (currentId === requestId.current) setLoadingProviderCategory(null);
    }
  }

  const busy = phase === "resolving" || phase === "searching";
  const candidatePhase = phase === "needs-confirmation";
  const allCount = response ? getPlacesForFilter(response, "all").length : null;
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [phase, activeFilter]);
  useEffect(() => {
    if (phase === "resolved") setConditionsOpen(true);
    if (phase === "results" && window.matchMedia("(max-width: 1000px)").matches) setConditionsOpen(false);
  }, [phase]);

  return <WorkspaceShell active={view} onNavigate={navigate}>
    <div className={s.explore} hidden={view !== "explore"}>
      <header className={s.searchHeader}>
        <div><h1>探索附近</h1><p>输入地点，确认中心，发现附近服务。</p></div>
        <form className={s.searchForm} onSubmit={(event) => { event.preventDefault(); resolveLocation(); }}>
          <label className={s.inputBox}><span className={s.srOnly}>地点</span><Icon name="search" /><input ref={inputRef} aria-label="地点" value={query} onChange={(event) => invalidateLocation(event.target.value)} placeholder="输入地点，例如深圳北站" maxLength={200} autoComplete="off" />
            {query && <button type="button" className={s.iconButton} aria-label="清空地点" onClick={clearQuery}>×</button>}
          </label><button type="submit" className={s.primary} disabled={busy}>{phase === "resolving" ? "解析中…" : "解析地点"}</button>
          <button type="button" className={s.historyShortcut} aria-label="查看最近搜索" onClick={() => navigate("history")}><Icon name="clock" /></button>
        </form>
      </header>
      <div className={s.metrics}>
        <div className={s.metric}><span className={s.metricIcon} data-color="pink"><Icon name="pin" /></span><div><span>搜索中心</span><strong title={resolvedLocation?.name}>{resolvedLocation?.name ?? "待确认"}</strong><Badge tone={resolvedLocation ? "success" : "warning"}>{resolvedLocation ? "已确认" : "请选择地点"}</Badge></div></div>
        <div className={s.metric}><span className={s.metricIcon} data-color="yellow"><Icon name="pin" /></span><div><span>搜索半径</span><strong>{radiusMeters / 1000} km</strong></div></div>
        <div className={s.metric}><span className={s.metricIcon} data-color="mint"><Icon name="panel" /></span><div><span>已选类别</span><strong>{selectedCategoryIds.length} / {ALL_CATEGORY_IDS.length}</strong></div></div>
        <div className={s.metric}><span className={s.metricIcon} data-color="lilac"><Icon name="search" /></span><div><span>本次已获取</span><strong>{phase === "results" && successfulCount > 0 && allCount !== null ? allCount + " 个地点" : "—"}</strong></div></div>
      </div>
      <div className={s.searchColumns}>
        <section className={s.mainPanel} aria-labelledby="search-panel-title">
          <div className={s.panelHeading}><div><h2 id="search-panel-title" tabIndex={-1}>{candidatePhase ? "请确认搜索中心" : "附近结果"}</h2><p>{candidatePhase ? "选择你想搜索的位置，附近服务将以此为中心。" : "围绕已确认的搜索中心"}</p></div>{candidatePhase && <Badge tone="warning">{candidates.length} 个候选</Badge>}</div>
          <div ref={scrollRef} className={s.listViewport} role="region" tabIndex={0} aria-label={candidatePhase ? "候选地点列表" : "附近结果列表"} aria-busy={busy}>
            {phase === "initial" && <EmptyState title="从一个地点开始">输入地名或地址，确认搜索中心后发现附近生活服务。</EmptyState>}
            {phase === "resolving" && <LoadingState>正在查找可能的地点…</LoadingState>}
            {candidatePhase && <CandidateList candidates={candidates} expanded={showAllCandidates} onExpand={() => setShowAllCandidates(true)} onSelect={confirmCandidate} />}
            {phase === "not-found" && <EmptyState title="没有找到明确地点">请补充城市、行政区或更完整的地点名称，再次解析。</EmptyState>}
            {phase === "resolve-error" && <Feedback tone="error" title="地点解析未完成" action={<button type="button" onClick={resolveLocation}>重新解析</button>}>{publicError}</Feedback>}
            {phase === "resolved" && <EmptyState title="搜索中心已确认">在右侧选择服务类别和半径，点击“搜索附近”。</EmptyState>}
            {phase === "searching" && <LoadingState>正在依次搜索 {selectedCategoryIds.length} 个类别…</LoadingState>}
            {phase === "search-error" && <Feedback tone="error" title="附近搜索未完成" action={<button type="button" onClick={searchNearby} disabled={!resolvedLocation || selectedCategoryIds.length === 0}>重新搜索</button>}>{publicError}</Feedback>}
            {phase === "results" && response && <ResultsView response={response} activeFilter={activeFilter} availableFilters={availableFilters} activeResult={activeResult} providerPageResult={providerPageResult} allowedSortModes={allowedSortModes} sortMode={effectiveSortMode} onFilterChange={changeFilter} onSortChange={changeSort} places={visiblePlaces} totalPlaces={sortedPlaces.length} canLoadMore={canLoadMore} canRequestProviderPage={canRequestProviderPage} canAnyCategoryRequestProviderPage={canAnyCategoryRequestProviderPage} providerPageLoading={providerPageCategory !== null && loadingProviderCategory === providerPageCategory} providerPageError={providerPageCategory ? providerPageErrors[providerPageCategory] ?? null : null} onLoadMore={loadMore} onLoadProviderPage={loadProviderPage} successfulCount={successfulCount} failedCount={failedCount} />}
          </div>
          <div className={s.panelFooter}>在框内上下滚动，浏览已加载的地点。<Icon name="arrow" /></div>
        </section>
        <aside className={s.conditions} aria-label="搜索条件">
          <div className={s.conditionHeading}><h2>搜索条件</h2><button type="button" className={s.conditionToggle} aria-expanded={conditionsOpen} aria-controls="condition-fields" onClick={() => setConditionsOpen((value) => !value)}>{conditionsOpen ? "收起条件" : "修改条件"}</button></div>
          <div id="condition-fields" className={s.conditionBody} data-open={conditionsOpen}>
            {resolvedLocation ? <><div className={s.confirmedCenter}><div className={s.centerTop}><span className={s.centerIcon}><Icon name="pin" /></span><strong>{resolvedLocation.name}</strong><Badge tone="success">已确认</Badge></div><p>{[resolvedLocation.city, resolvedLocation.district].filter(Boolean).join(" · ")}</p>{resolvedLocation.address && <p>{resolvedLocation.address}</p>}<button type="button" className={s.textButton} onClick={clearResolved} disabled={phase === "searching"}>修改地点</button></div>
              <CategorySelector selected={selectedCategoryIds} onChange={changeCategories} />
              {selectedCategoryIds.length === 0 && <Feedback tone="warning" title="至少选择一个类别">选中需要的服务后再搜索。</Feedback>}
              <fieldset className={s.radius}><legend>搜索半径</legend><div>{ALLOWED_RADIUS_METERS.map((value) => <label key={value}><input type="radio" name="radius" value={value} checked={radiusMeters === value} onChange={(event) => changeRadius(event.target.value)} /><span>{value / 1000} km</span></label>)}</div></fieldset>
              <button className={s.primary + " " + s.searchNearby} type="button" onClick={searchNearby} disabled={phase === "searching" || selectedCategoryIds.length === 0}>{phase === "searching" ? "正在搜索…" : "搜索附近"}</button>
            </> : <div className={s.waiting}><Badge tone="warning">等待确认</Badge><h3>先选定一个搜索中心</h3><p>解析地点并选择候选后，即可设置服务类别和搜索半径。</p><ol><li>选择候选地点</li><li>设置条件，搜索附近</li></ol><button type="button" disabled>请先确认地点</button></div>}
          </div>
        </aside>
      </div>
    </div>
    {view === "history" && <HistoryView history={history} onSelect={handleHistorySelect} onDelete={handleHistoryDelete} />}
    {view === "personal" && <PersonalCenter />}
  </WorkspaceShell>;
}

function ResultsView({ response, activeFilter, availableFilters, activeResult, providerPageResult, allowedSortModes, sortMode, onFilterChange, onSortChange, places, totalPlaces, canLoadMore, canRequestProviderPage, canAnyCategoryRequestProviderPage, providerPageLoading, providerPageError, onLoadMore, onLoadProviderPage, successfulCount, failedCount }: { response: SearchResponse; activeFilter: ActiveFilter; availableFilters: ActiveFilter[]; activeResult: CategorySearchResult | null; providerPageResult: CategorySearchResult | null; allowedSortModes: SortMode[]; sortMode: SortMode; onFilterChange: (filter: ActiveFilter) => void; onSortChange: (mode: SortMode) => void; places: Place[]; totalPlaces: number; canLoadMore: boolean; canRequestProviderPage: boolean; canAnyCategoryRequestProviderPage: boolean; providerPageLoading: boolean; providerPageError: string | null; onLoadMore: () => void; onLoadProviderPage: () => void; successfulCount: number; failedCount: number }) {
  const skippedCount = getCategoryCounts(response.categories).skipped;
  const resultCount = activeFilter === "all" ? totalPlaces : activeResult?.places.length ?? 0;
  const providerPageIsFull = providerPageResult?.page?.pageNumber === 2 && providerPageResult.page.returnedCount === providerPageResult.page.pageSize;
  const exhaustedMessage = activeFilter === "all" && providerPageResult === null && canAnyCategoryRequestProviderPage
    ? "已显示本次搜索的全部结果；切换到具体类别可获取更多。"
    : providerPageIsFull
      ? `当前类别最多展示两页，已显示 ${totalPlaces} 个结果。`
      : `已显示全部 ${totalPlaces} 个结果。`;
  return <div className={s.resultsBody}>
    <div className={s.resultToolbar}><div className={s.filters} aria-label="结果类别">{availableFilters.map((filter) => {
      const item = filter === "all" ? null : response.categories.find((entry) => entry.category.key === filter);
      return <button type="button" aria-pressed={activeFilter === filter} key={filter} onClick={() => onFilterChange(filter)}>{filter === "all" ? "全部" : categoryLabel(filter)}{item?.status === "error" ? " · 失败" : item?.status === "skipped" ? " · 未搜索" : item?.status === "empty" ? " · 空" : ""}</button>;
    })}</div><label className={s.sort}><span>排序</span><select value={sortMode} onChange={(event) => onSortChange(event.target.value as SortMode)}>{allowedSortModes.map((mode) => <option key={mode} value={mode}>{sortLabel(mode)}</option>)}</select></label></div>
    <div className={s.resultMeta}><span>{activeFilter === "all" ? "本次已获取 " + resultCount + " 个地点" : categoryLabel(activeFilter) + " · " + resultCount + " 个地点"}</span><Badge tone={failedCount || skippedCount ? "warning" : "success"}>{successfulCount} 类完成{failedCount > 0 ? " · " + failedCount + " 类失败" : ""}{skippedCount > 0 ? " · " + skippedCount + " 类未搜索" : ""}</Badge></div>
    {response.termination ? <Feedback tone="warning" title="搜索提前结束">{publicSearchErrorMessage(response.termination.code)}；已完成的类别仍可查看。</Feedback> : failedCount > 0 && <Feedback tone="warning" title={failedCount === response.categories.length ? "本次搜索的类别均未成功" : "部分服务类别暂不可用"}>{failedCount === response.categories.length ? "已完成所有类别尝试，可切换类别查看失败原因后重试。" : "可以继续查看成功结果，或调整条件后重新搜索。"}</Feedback>}
    {activeFilter !== "all" && activeResult?.status === "error" && <Feedback tone="error" title="该类别暂时无法搜索">{activeResult.error?.message ?? "请稍后重试，或查看其他类别。"}</Feedback>}
    {activeFilter !== "all" && activeResult?.status === "skipped" && <Feedback tone="warning" title="该类别尚未搜索">搜索提前结束，该类别未执行。</Feedback>}
    {activeFilter !== "all" && activeResult?.status === "empty" && <EmptyState title="当前类别没有结果">{getEmptyStateMessage(activeFilter)}</EmptyState>}
    {(activeFilter === "all" || activeResult?.status === "success") && <>
      {places.length > 0 ? <PlaceList places={places} /> : successfulCount > 0 ? <EmptyState title={response.termination ? "已完成的类别暂无结果" : "当前范围内暂无结果"}>试试调整服务类别或搜索半径。</EmptyState> : null}
      <div className={s.listFooter}>
        {canLoadMore && <button type="button" onClick={onLoadMore}>加载更多（已显示 {places.length}/{totalPlaces}）</button>}
        {!canLoadMore && (canRequestProviderPage || providerPageLoading) && <button type="button" onClick={onLoadProviderPage} disabled={providerPageLoading}>{providerPageLoading ? "正在获取更多地点…" : "获取更多附近结果"}</button>}
        {providerPageError && <Feedback tone="error" title="更多地点加载失败" action={<button type="button" onClick={onLoadProviderPage} disabled={providerPageLoading}>重试加载</button>}>{providerPageError}</Feedback>}
        {!canLoadMore && !canRequestProviderPage && !providerPageLoading && !providerPageError && <p className={s.muted}>{exhaustedMessage}</p>}
      </div>
    </>}
  </div>;
}
