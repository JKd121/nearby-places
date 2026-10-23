"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, History, MapPin, Plus, Search } from "lucide-react";
import { ExploreDialog } from "../components/explore-dialog";
import { ExploreMapState } from "../components/explore-map-state";
import { Button } from "../components/ui/button";
import { useSearchHistory } from "./useSearchHistory";
import type { SearchHistoryItem, SearchHistoryInput } from "./search-history-store";
import { isSearchHistoryItem } from "./search-history-store";
import { copyConfirmedLocation } from "../history/validation";
import { CATEGORIES } from "../amap/categories";
import type { CategoryKey, CategorySearchResult, GeocodedPlace, Place } from "../amap/types";
import type { LocationCandidate } from "../location/types";
import type { SearchRadius, SearchResponse, SearchSecondPageResponse } from "../search/contracts";
import type { SortMode } from "../search/sort";
import { buildAmapMarkerUrl } from "./location-links";
import {
  ALLOWED_RADIUS_METERS, ALL_CATEGORY_IDS, CATEGORY_GROUPS, clearCategories,
  ensureValidSortMode, formatCost, formatDistance, formatRating, getAllowedSortModes,
  canRequestSecondProviderPage, getAvailableFilters, getCategoryResult, getGroupSelection,
  getBusinessHoursDisplay, getInitialVisibleCount, getNextVisibleCount, getPlacesForFilter, mergeProviderPageResult,
  resetSearchView, resolveProviderPageCategory, selectAllCategories, sortPlacesForFilter,
  getPlaceRenderKey, getEmptyStateMessage, isTransitCategory,
  toggleCategory, toggleGroup, truncateTag, type ActiveFilter,
} from "./logic";

type Phase = "initial" | "resolving" | "needs-confirmation" | "resolved" | "not-found" | "searching" | "results" | "resolve-error" | "search-error";
interface PublicApiError { message?: string; }
interface ResolutionApiResponse { status?: "confirmed" | "needs_confirmation" | "not_found"; location?: LocationCandidate; candidates?: LocationCandidate[]; error?: PublicApiError; }

type HistoryReplaySnapshot = {
  query: string;
  categoryIds: CategoryKey[];
  radiusMeters: SearchRadius;
};

function categoryLabel(key: CategoryKey): string { return CATEGORIES.find((category) => category.key === key)?.label ?? key; }
async function readJson(response: Response): Promise<unknown> { try { return await response.json(); } catch { return null; } }
function sortLabel(mode: SortMode): string { return { "distance-asc": "距离最近", "rating-desc": "评分最高", "cost-asc": "消费最低", "cost-desc": "消费最高" }[mode]; }

export default function SearchApp({ replayHistoryId }: { replayHistoryId?: string | undefined }) {
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
  const historyItems = history.items;
  const [historyOpen, setHistoryOpen] = useState(false);
  const requestId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const attemptedReplayId = useRef<string | undefined>(undefined);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const [resultsExpanded, setResultsExpanded] = useState(false);
  const conditionTriggerRef = useRef<HTMLButtonElement>(null);
  const historyTriggerRef = useRef<HTMLButtonElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusResultsAfterClose = useRef(false);
  const availableFilters = useMemo(() => getAvailableFilters(response), [response]);
  const activeResult = useMemo(() => getCategoryResult(response, activeFilter), [response, activeFilter]);
  const activePlaces = useMemo(() => getPlacesForFilter(response, activeFilter), [response, activeFilter]);
  const allowedSortModes = useMemo(() => getAllowedSortModes(activeFilter, selectedCategoryIds), [activeFilter, selectedCategoryIds]);
  const effectiveSortMode = useMemo(() => ensureValidSortMode(sortMode, activeFilter, selectedCategoryIds), [sortMode, activeFilter, selectedCategoryIds]);
  const sortedPlaces = useMemo(() => sortPlacesForFilter(activePlaces, effectiveSortMode, activeFilter, selectedCategoryIds), [activePlaces, effectiveSortMode, activeFilter, selectedCategoryIds]);
  const visiblePlaces = useMemo(() => sortedPlaces.slice(0, visibleCount), [sortedPlaces, visibleCount]);
  const successfulCount = useMemo(() => response?.categories.filter((item) => item.status !== "error").length ?? 0, [response]);
  const failedCount = useMemo(() => response?.categories.filter((item) => item.status === "error").length ?? 0, [response]);
  const canLoadMore = visiblePlaces.length < sortedPlaces.length;
  const providerPageCategory = useMemo(() => resolveProviderPageCategory(activeFilter, selectedCategoryIds), [activeFilter, selectedCategoryIds]);
  const providerPageResult = useMemo(() => providerPageCategory ? getCategoryResult(response, providerPageCategory) : null, [response, providerPageCategory]);
  const canRequestProviderPage = !canLoadMore && loadingProviderCategory === null && canRequestSecondProviderPage(providerPageResult);
  const canAnyCategoryRequestProviderPage = useMemo(() => response?.categories.some(canRequestSecondProviderPage) ?? false, [response]);

  function resetView(): void {
    const next = resetSearchView();
    setResponse(null); setActiveFilter(next.activeFilter); setSortMode(next.sortMode); setVisibleCount(next.visibleCount); setPublicError(null); setLoadingProviderCategory(null); setProviderPageErrors({});
  }

  function invalidateLocation(nextQuery: string): void {
    attemptedReplayId.current = replayHistoryId;
    setReplayError(null);
    setQuery(nextQuery);
    requestId.current += 1;
    setResolvedLocation(null); setResolvedQuery(null); setCandidates([]); setShowAllCandidates(false); setPublicError(null); setPhase("initial"); resetView();
  }

  function clearQuery(): void {
    setHistoryOpen(false);
    invalidateLocation("");
    inputRef.current?.focus();
  }

  function openSearchHistory(): void {
    setHistoryOpen(true);
    void history.refresh();
  }

  function closeSearchHistory(): void { setHistoryOpen(false); }

  function toggleSearchHistory(): void {
    if (historyOpen) closeSearchHistory();
    else openSearchHistory();
  }

  function handleHistoryDelete(id: string, button: HTMLButtonElement): void {
    if (document.activeElement === button) {
      const buttons = Array.from(button.closest("ul")?.querySelectorAll<HTMLButtonElement>(".search-history-delete") ?? []);
      const index = buttons.indexOf(button);
      const next = buttons[index + 1] ?? buttons[index - 1] ??
        document.querySelector<HTMLButtonElement>(".history-toggle-button");
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

    requestId.current += 1;
    setQuery(item.query);
    setSelectedCategoryIds(replaySnapshot.categoryIds);
    setRadiusMeters(replaySnapshot.radiusMeters);
    setResolvedLocation(location);
    setResolvedQuery(item.query.trim());
    setCandidates([]);
    setShowAllCandidates(false);
    resetView();
    setHistoryOpen(false);
    void searchNearbyForSnapshot(location, replaySnapshot);
  }

  const replayRecord = useEffectEvent(handleHistorySelect);

  useEffect(() => {
    if (!replayHistoryId || attemptedReplayId.current === replayHistoryId || !history.hasLoaded || history.loadError) return;
    attemptedReplayId.current = replayHistoryId;
    const item = history.items.find((entry) => entry.id === replayHistoryId);
    if (item) {
      setReplayError(null);
      replayRecord(item);
    } else {
      setReplayError("这条历史已不在当前浏览器的最近记录中。请打开历史记录，或重新选择地点。");
    }
    // The current render's replay handler retains the original confirmed-search flow.
    // Only a new requested ID or a completed history read may trigger a replay.
  }, [replayHistoryId, history.hasLoaded, history.loadError, history.items]);

  function changeCategories(next: CategoryKey[]): void { requestId.current += 1; setSelectedCategoryIds(next); resetView(); if (resolvedLocation) setPhase("resolved"); }

  function changeRadius(next: string): void {
    const value = Number(next) as SearchRadius;
    if (!ALLOWED_RADIUS_METERS.includes(value as (typeof ALLOWED_RADIUS_METERS)[number])) return;
    requestId.current += 1; setRadiusMeters(value); resetView(); if (resolvedLocation) setPhase("resolved");
  }

  function resolveLocation(): void {
    if (query.trim()) setSelectedCategoryIds(selectAllCategories());
    void resolveLocationForQuery(query);
  }

  async function resolveLocationForQuery(queryToResolve: string): Promise<void> {
    const trimmed = queryToResolve.trim();
    if (!trimmed) { setPublicError("请先输入地点名称"); setPhase("resolve-error"); return; }
    const currentId = requestId.current + 1; requestId.current = currentId;
    setPhase("resolving"); setPublicError(null); resetView(); setResolvedLocation(null); setResolvedQuery(null); setCandidates([]); setShowAllCandidates(false);
    try {
      const result = await fetch("/api/resolve-location", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: trimmed }) });
      const payload = await readJson(result) as ResolutionApiResponse | null;
      if (currentId !== requestId.current) return;
      if (!result.ok) throw new Error(payload?.error?.message ?? "地点解析失败");
      if (payload?.status === "needs_confirmation") { setCandidates(payload.candidates ?? []); setPhase("needs-confirmation"); return; }
      if (payload?.status === "not_found") { setPhase("not-found"); return; }
      if (payload?.status !== "confirmed" || !payload.location) {
        throw new Error("地点解析失败");
      }
      setResolvedLocation(payload.location); setResolvedQuery(trimmed); setPhase("resolved");
    } catch (error) {
      if (currentId !== requestId.current) return;
      setPublicError(error instanceof Error ? error.message : "地点解析失败"); setPhase("resolve-error");
    }
  }

  function confirmCandidate(candidate: LocationCandidate): void {
    requestId.current += 1;
    setResolvedLocation(candidate); setResolvedQuery(query.trim()); setCandidates([]); setShowAllCandidates(false); setPublicError(null); resetView(); setPhase("resolved");
  }

  function clearResolved(): void {
    requestId.current += 1; setResolvedLocation(null); setResolvedQuery(null); setCandidates([]); setShowAllCandidates(false); resetView(); setPublicError(null); setPhase("initial");
    setConditionsOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

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
    const currentId = requestId.current + 1; requestId.current = currentId;
    setPhase("searching"); setPublicError(null);
    setResultsExpanded(true);
    setConditionsOpen(false);
    requestAnimationFrame(() => resultHeadingRef.current?.focus());
    try {
      const searchLocation: GeocodedPlace = { query: snapshot.query.trim(), formattedAddress: location.address ?? location.name, province: null, city: location.city, district: location.district, level: location.placeType, longitude: location.location.longitude, latitude: location.location.latitude };
      const historyInput: SearchHistoryInput = {
        query: searchLocation.query,
        categoryIds: [...snapshot.categoryIds],
        radiusMeters: snapshot.radiusMeters,
        confirmedLocation: copyConfirmedLocation(location),
      };
      const result = await fetch("/api/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ center: { longitude: location.location.longitude, latitude: location.location.latitude }, resolvedLocation: searchLocation, categoryIds: snapshot.categoryIds, radiusMeters: snapshot.radiusMeters }) });
      const payload = await readJson(result) as (SearchResponse & { error?: PublicApiError }) | null;
      if (currentId !== requestId.current) return;

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
    (category) => category.status !== "error",
  );

if (hasSuccessfulCategory) {
  void history.save(historyInput);
}
    } catch (error) {
      if (currentId !== requestId.current) return;
      setPublicError(error instanceof Error ? error.message : "周边搜索失败"); setPhase("search-error");
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
    const currentId = requestId.current;
    setLoadingProviderCategory(categoryId);
    setProviderPageErrors((current) => {
      const { [categoryId]: _cleared, ...remaining } = current;
      return remaining;
    });
    try {
      const result = await fetch("/api/search/page", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ center: { longitude: response.resolvedLocation.longitude, latitude: response.resolvedLocation.latitude }, categoryId, radiusMeters }) });
      const payload = await readJson(result) as (SearchSecondPageResponse & { error?: PublicApiError }) | null;
      if (currentId !== requestId.current) return;
      if (!result.ok || !payload?.page || payload.categoryId !== categoryId) throw new Error(payload?.error?.message ?? "获取更多地点失败");
      const nextResponse = mergeProviderPageResult(response, categoryId, payload.page);
      const nextTotal = sortPlacesForFilter(getPlacesForFilter(nextResponse, activeFilter), effectiveSortMode, activeFilter, selectedCategoryIds).length;
      setResponse(nextResponse);
      setVisibleCount((current) => getNextVisibleCount(activeFilter, current, nextTotal));
    } catch (error) {
      if (currentId !== requestId.current) return;
      setProviderPageErrors((current) => ({ ...current, [categoryId]: error instanceof Error ? error.message : "获取更多地点失败" }));
    } finally {
      if (currentId === requestId.current) setLoadingProviderCategory(null);
    }
  }

  const noCategoriesSelected = selectedCategoryIds.length === 0;
  const busy = phase === "resolving" || phase === "searching";
  const conditionSummary = noCategoriesSelected
    ? "未选择类别"
    : selectedCategoryIds.length === ALL_CATEGORY_IDS.length
      ? "全部类别"
      : selectedCategoryIds.map(categoryLabel).join("、");
  const resultTitle = phase === "searching" ? "正在搜索附近…" : phase === "search-error" ? "搜索未完成" : response ? "附近结果" : "搜索结果";

  function restoreDialogFocus(event: Event, target: "location" | "conditions" | "history"): void {
    event.preventDefault();
    if (focusResultsAfterClose.current) {
      focusResultsAfterClose.current = false;
      resultHeadingRef.current?.focus();
    } else if (target === "location") {
      (resolvedLocation ? conditionTriggerRef.current : inputRef.current)?.focus();
    } else {
      (target === "history" ? historyTriggerRef.current : conditionTriggerRef.current)?.focus();
    }
  }

  return <div className="explore-workbench">
    <div className="workspace-toolbar">
      <h1 className="sr-only">探索附近</h1>
      <div className="workspace-location-row">
        <form className="location-form" onSubmit={(event) => { event.preventDefault(); resolveLocation(); }}>
          <label className="sr-only" htmlFor="location-query">地点</label>
          <div className="location-input-wrap"><Search aria-hidden="true" /><input ref={inputRef} id="location-query" name="location" value={query} onChange={(event) => invalidateLocation(event.target.value)} placeholder="输入地点，例如深圳北站" autoComplete="off" />
            {query && <button type="button" className="clear-input-button" aria-label="清空地点" onClick={clearQuery}>×</button>}
            <Button type="button" ref={historyTriggerRef} variant="ghost" size="icon" className="history-toggle-button" aria-label="历史记录" aria-expanded={historyOpen} onClick={toggleSearchHistory}><History aria-hidden="true" /></Button>
          </div>
          <Button type="submit" variant="outline" className="location-parse" disabled={busy}>{phase === "resolving" ? "解析中…" : "解析地点"}</Button>
        </form>
        <div className="location-summary" aria-live="polite">
          {resolvedLocation ? <>
          <MapPin aria-hidden="true" />
          <div className="location-summary-copy"><strong>{resolvedLocation.name}</strong><span>{[resolvedLocation.city, resolvedLocation.district, resolvedLocation.address].filter(Boolean).join(" · ") || "地址暂无"}</span></div>
          <Button variant="ghost" size="sm" onClick={clearResolved}>修改地点</Button>
          </> : <span className="location-unconfirmed">解析地点后，选择并确认搜索中心</span>}
        </div>
      </div>
      <div className="workspace-feedback" aria-live="polite">
        {phase === "resolving" && <span role="status">正在查找地点…</span>}
        {phase === "not-found" && <span role="status">没有找到明确地点，请补充城市或更完整的名称。</span>}
        {phase === "resolve-error" && <span className="error-text" role="alert">{publicError}</span>}
        {noCategoriesSelected && <span className="error-text">请至少选择一个类别。</span>}
        {replayHistoryId && !history.hasLoaded && !history.loadError && <span className="replay-message" role="status">正在恢复原来的搜索条件…</span>}
        {replayHistoryId && history.loadError && <span className="replay-message" role="alert">暂时无法读取历史。<button type="button" onClick={() => void history.refresh(true)} disabled={history.loading}>重试读取历史</button></span>}
        {replayError && <span className="replay-message" role="alert">{replayError}</span>}
      </div>
    </div>

    <div className="workspace-condition-row" aria-label="附近搜索条件">
      <h2>附近生活服务</h2>
      <div className="workspace-category-strip">
        {CATEGORIES.slice(0, 5).map((category) => <button type="button" className="workspace-category" key={category.key} aria-pressed={selectedCategoryIds.includes(category.key)} disabled={phase === "resolving"} onClick={() => changeCategories(toggleCategory(selectedCategoryIds, category.key))}>{category.label}</button>)}
        <Button ref={conditionTriggerRef} variant="ghost" className="condition-trigger" aria-label="附近生活服务" aria-expanded={conditionsOpen} disabled={phase === "resolving"} onClick={() => setConditionsOpen(true)}><Plus aria-hidden="true" /><span>更多类别</span><span className="sr-only">{conditionSummary} · {radiusMeters / 1000} km</span></Button>
      </div>
      <label className="workspace-radius"><span>搜索范围</span><select aria-label="搜索范围" value={radiusMeters} disabled={phase === "resolving"} onChange={(event) => changeRadius(event.target.value)}>{ALLOWED_RADIUS_METERS.map((radius) => <option key={radius} value={radius}>{radius / 1000} km</option>)}</select></label>
      <Button className="workspace-search" onClick={() => void searchNearby()} disabled={!resolvedLocation || noCategoriesSelected || busy}><Search aria-hidden="true" />{phase === "searching" ? "搜索中…" : "搜索附近"}</Button>
    </div>

    <div className="workspace-body">
      <section className="workbench-results" data-expanded={resultsExpanded} aria-label="附近结果面板" aria-busy={phase === "searching"}>
        <div className="workbench-results-heading">
          <div><h2 ref={resultHeadingRef} tabIndex={-1}>{resultTitle}</h2>{response && phase === "results" && <p>{sortedPlaces.length} 个结果 · {successfulCount} 类成功{failedCount > 0 ? " · " + failedCount + " 类失败" : ""}</p>}</div>
          <Button variant="ghost" size="sm" className="results-panel-toggle" aria-expanded={resultsExpanded} aria-controls="workbench-result-content" onClick={() => setResultsExpanded(!resultsExpanded)}>{resultsExpanded ? "收起结果" : "展开结果"}{resultsExpanded ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}</Button>
        </div>
        <div id="workbench-result-content" className="workbench-result-content">
          {phase === "searching" ? <p className="workspace-empty" role="status">正在搜索所选类别，请稍候…</p> : phase === "search-error" ? <div className="workspace-empty" role="alert"><strong>附近搜索失败</strong><p>{publicError}</p><Button variant="outline" onClick={() => void searchNearby()}>重试搜索</Button></div> : response ? <ResultsView
            response={response} activeFilter={activeFilter} availableFilters={availableFilters} activeResult={activeResult} providerPageResult={providerPageResult}
            allowedSortModes={allowedSortModes} sortMode={effectiveSortMode} onFilterChange={changeFilter} onSortChange={changeSort}
            places={visiblePlaces} totalPlaces={sortedPlaces.length} canLoadMore={canLoadMore} canRequestProviderPage={canRequestProviderPage}
            canAnyCategoryRequestProviderPage={canAnyCategoryRequestProviderPage} providerPageLoading={loadingProviderCategory !== null}
            providerPageError={providerPageCategory ? providerPageErrors[providerPageCategory] ?? null : null}
            onLoadMore={loadMore} onLoadProviderPage={() => void loadProviderPage()} successfulCount={successfulCount} failedCount={failedCount}
          /> : <div className="workspace-empty"><strong>{resolvedLocation ? "已确认搜索中心" : "从一个地点开始"}</strong><p>{resolvedLocation ? "调整类别与半径，搜索附近的地点。" : "输入目的地并确认位置，即可搜索附近。"}</p></div>}
        </div>
      </section>
      <ExploreMapState location={resolvedLocation} radiusMeters={radiusMeters} />
    </div>

    <ExploreDialog open={phase === "needs-confirmation"} onOpenChange={(open) => { if (!open) setPhase("initial"); }} title="确认地点" description="选择搜索中心，再查看附近。" onCloseAutoFocus={(event) => restoreDialogFocus(event, "location")}>
      <CandidateList candidates={candidates} expanded={showAllCandidates} onExpand={() => setShowAllCandidates(true)} onSelect={confirmCandidate} />
    </ExploreDialog>
    <ExploreDialog open={conditionsOpen} onOpenChange={setConditionsOpen} title="附近生活服务" description="选择服务类别与搜索半径。" onCloseAutoFocus={(event) => restoreDialogFocus(event, "conditions")} footer={<><Button variant="ghost" onClick={() => setConditionsOpen(false)}>收起条件</Button><Button onClick={() => { focusResultsAfterClose.current = true; void searchNearby(); }} disabled={!resolvedLocation || noCategoriesSelected || busy}>搜索附近</Button></>}>
      <CategorySelector selected={selectedCategoryIds} onChange={changeCategories} />
      <fieldset className="radius-selector"><legend>搜索半径</legend><div className="radius-options">{ALLOWED_RADIUS_METERS.map((radius) => <label className="option-pill" key={radius}><input type="radio" name="radius" value={radius} checked={radiusMeters === radius} onChange={(event) => changeRadius(event.target.value)} />{radius / 1000} km</label>)}</div></fieldset>
    </ExploreDialog>
    <ExploreDialog open={historyOpen} onOpenChange={setHistoryOpen} title="最近搜索" description="恢复当时的地点、类别和半径，并重新搜索。" onCloseAutoFocus={(event) => restoreDialogFocus(event, "history")}>
      {!history.hasLoaded && historyItems.length === 0 && !history.loadError ? <p role="status">正在读取最近搜索…</p> : historyItems.length === 0 ? <p className="muted">{history.pendingDeleteCount > 0 ? "正在同步删除…" : history.hasMore ? (history.loadError ? "暂时没有可显示的记录" : "正在读取更多记录…") : history.loadError ? "" : "暂无搜索历史"}</p> : <ul className="search-history-list">{historyItems.map((item) => <li key={item.id}><div className="search-history-row">
        <button type="button" className="search-history-item" onClick={() => { focusResultsAfterClose.current = true; handleHistorySelect(item); }}><strong>{item.confirmedLocation.name}</strong>{item.confirmedLocation.address && <span>{item.confirmedLocation.address}</span>}<span>{item.categoryIds.length} 个类别 · {item.radiusMeters / 1000} km</span></button>
        <button type="button" className="search-history-delete" aria-label={"删除这条搜索历史：" + item.confirmedLocation.name} onClick={(event) => handleHistoryDelete(item.id, event.currentTarget)}><span aria-hidden="true">×</span></button>
      </div></li>)}</ul>}
      {history.deleteError && <p className="error-text" role="alert">{history.deleteError}</p>}
      {history.loadError && <div className="history-feedback"><p className="error-text" role="alert">{history.loadError}</p><Button variant="outline" onClick={() => void history.refresh(true)} disabled={history.loading}>重试</Button></div>}
    </ExploreDialog>
  </div>;
}
function CandidateList({ candidates, expanded, onExpand, onSelect }: { candidates: readonly LocationCandidate[]; expanded: boolean; onExpand: () => void; onSelect: (candidate: LocationCandidate) => void }) {
  const visibleCandidates = expanded ? candidates : candidates.slice(0, 5);
  return <section className="candidate-panel" aria-live="polite">
    <div className="candidate-heading"><h3>{candidates.length > 1 ? "找到多个可能的地点" : "请选择搜索中心"}</h3><span className="candidate-count">{candidates.length} 个候选</span></div>
    <div className="candidate-list">{visibleCandidates.map((candidate, index) => <button type="button" className="candidate-button" key={(candidate.id ?? candidate.name) + "-" + index} onClick={() => onSelect(candidate)}>
      <MapPin aria-hidden="true" /><span className="candidate-content"><strong>{candidate.name}</strong>{candidate.placeType && <span>{candidate.placeType}</span>}<span>{[candidate.city, candidate.district].filter(Boolean).join(" · ") || "行政区未知"}</span>{candidate.address && <span>{candidate.address}</span>}</span>
    </button>)}</div>
    {!expanded && candidates.length > 5 && <Button variant="outline" className="candidate-more" onClick={onExpand}>查看更多地点</Button>}
  </section>;
}

function CategorySelector({ selected, onChange }: { selected: readonly CategoryKey[]; onChange: (next: CategoryKey[]) => void }) {
  return <fieldset className="category-selector"><legend>服务类别</legend><div className="selection-actions"><span className="selection-count">{selected.length}/{ALL_CATEGORY_IDS.length} 已选</span><div className="selection-utilities"><button type="button" className="utility-button" onClick={() => onChange(selectAllCategories())}>全选</button><button type="button" className="utility-button" onClick={() => onChange(clearCategories())}>清空</button></div></div><div className="category-groups">{CATEGORY_GROUPS.map((group) => { const selection = getGroupSelection(selected, group.categoryIds); return <div className="category-group" key={group.key}><div className="category-group-heading"><strong>{group.label}</strong><button type="button" className="text-button" aria-pressed={selection === "all"} data-selection={selection} onClick={() => onChange(toggleGroup(selected, group.categoryIds))}>{selection === "all" ? "取消整组" : "选中整组"}</button></div><div className="category-options">{group.categoryIds.map((key) => <label className="checkbox-option" key={key}><input type="checkbox" checked={selected.includes(key)} onChange={() => onChange(toggleCategory(selected, key))} />{categoryLabel(key)}</label>)}</div></div>; })}</div></fieldset>;
}

function ResultsView({ response, activeFilter, availableFilters, activeResult, providerPageResult, allowedSortModes, sortMode, onFilterChange, onSortChange, places, totalPlaces, canLoadMore, canRequestProviderPage, canAnyCategoryRequestProviderPage, providerPageLoading, providerPageError, onLoadMore, onLoadProviderPage, successfulCount, failedCount }: { response: SearchResponse; activeFilter: ActiveFilter; availableFilters: ActiveFilter[]; activeResult: CategorySearchResult | null; providerPageResult: CategorySearchResult | null; allowedSortModes: SortMode[]; sortMode: SortMode; onFilterChange: (filter: ActiveFilter) => void; onSortChange: (mode: SortMode) => void; places: Place[]; totalPlaces: number; canLoadMore: boolean; canRequestProviderPage: boolean; canAnyCategoryRequestProviderPage: boolean; providerPageLoading: boolean; providerPageError: string | null; onLoadMore: () => void; onLoadProviderPage: () => void; successfulCount: number; failedCount: number }) {
  const resultCount = activeFilter === "all" ? totalPlaces : activeResult?.places.length ?? 0;
  const providerPageIsFull = providerPageResult?.page?.pageNumber === 2 && providerPageResult.page.returnedCount === providerPageResult.page.pageSize;
  const exhaustedMessage = activeFilter === "all" && providerPageResult === null && canAnyCategoryRequestProviderPage
    ? "已显示本次搜索的全部结果；切换到具体类别可获取更多。"
    : providerPageIsFull
      ? `当前类别最多展示两页，已显示 ${totalPlaces} 个结果。`
      : `已显示全部 ${totalPlaces} 个结果。`;
  return <section className="results" aria-live="polite"><div className="results-summary"><div><p className="section-kicker">附近发现</p><h2>附近结果</h2><p>{activeFilter === "all" ? `共找到 ${resultCount} 个结果` : `${categoryLabel(activeFilter)} · ${resultCount} 个结果`}</p></div><div className="result-stat"><strong>{resultCount}</strong><span>{successfulCount} 类成功{failedCount > 0 ? ` · ${failedCount} 类失败` : ""}</span></div></div><div className="result-toolbar"><div className="filter-row" role="tablist" aria-label="结果类别">{availableFilters.map((filter) => { const item = filter === "all" ? null : response.categories.find((entry) => entry.category.key === filter); return <button type="button" role="tab" aria-selected={activeFilter === filter} className={activeFilter === filter ? "filter-button active" : "filter-button"} key={filter} onClick={() => onFilterChange(filter)}>{filter === "all" ? "全部" : categoryLabel(filter)}{item?.status === "error" ? " · 失败" : item?.status === "empty" ? " · 空" : ""}</button>; })}</div><label className="sort-control"><span>排序</span><select aria-label="排序" value={sortMode} onChange={(event) => onSortChange(event.target.value as SortMode)}>{allowedSortModes.map((mode) => <option value={mode} key={mode}>{sortLabel(mode)}</option>)}</select></label></div>{activeFilter !== "all" && activeResult?.status === "error" && <p className="error-text" role="alert">{activeResult.error?.message ?? "该类别暂时无法搜索"}</p>}{activeFilter !== "all" && activeResult?.status === "empty" && <p className="muted">{getEmptyStateMessage(activeFilter)}</p>}{(activeFilter === "all" || activeResult?.status === "success") && <><PlaceList places={places} /><div className="load-more-row">{canLoadMore && <button type="button" className="secondary" onClick={onLoadMore}><span aria-hidden="true">↘</span>加载更多（已显示 {places.length}/{totalPlaces}）</button>}{!canLoadMore && (canRequestProviderPage || providerPageLoading) && <button type="button" className="secondary" onClick={onLoadProviderPage} disabled={providerPageLoading}><span aria-hidden="true">↘</span>{providerPageLoading ? "正在获取更多地点…" : "获取更多附近结果"}</button>}{providerPageError && <p className="error-text" role="status">{providerPageError}</p>}{!canLoadMore && !canRequestProviderPage && !providerPageLoading && !providerPageError && <p className="muted" role="status">{exhaustedMessage}</p>}</div></>}</section>;
}

function PlaceList({ places }: { places: Place[] }) {
  return <ol className="place-list">{places.map((place, index) => {
    const cost = formatCost(place.category, place.cost);
    const tag = truncateTag(place.tag);
    const isTransit = isTransitCategory(place.category);
    const hasRating = !isTransit && place.rating !== null && Number.isFinite(place.rating);
    const metadata = [
      hasRating ? { value: formatRating(place.rating), className: "" } : null,
      cost ? { value: cost, className: place.category === "gym" ? "place-cost-weak" : "place-cost" } : null,
    ].filter((value): value is { value: string; className: string } => value !== null);
    const markerUrl = buildAmapMarkerUrl({ ...place, preferPoiId: isTransit });
    return <li className="place-row" key={getPlaceRenderKey(place, index)}>
      <span className="place-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
      <div className="place-main">
        <div className="place-title-row">
          <div className="place-title-stack"><span className="place-category-badge">{categoryLabel(place.category)}</span><h4>{place.name}</h4></div>
          <span className="place-distance"><span aria-hidden="true">⌖</span>{formatDistance(place.distanceMeters)}</span>
        </div>
        {metadata.length > 0 && <p className="place-meta">{metadata.map((item, metadataIndex) => <span className={item.className} key={item.value}>{metadataIndex > 0 && " · "}{item.value}</span>)}</p>}
        {tag && <p className="place-tag">{tag}</p>}
        {!isTransit && <p className="place-hours">{getBusinessHoursDisplay(place)}</p>}
        <div className="place-bottom-row">
          <p className="place-address">{place.address || "地址暂无"}</p>
          {markerUrl && <a className="place-location-link" href={markerUrl} target="_blank" rel="noopener noreferrer" aria-label={isTransit ? `在高德查看站点详情「${place.name}」` : `在高德地图查看「${place.name}」的位置`}>{isTransit ? "在高德查看站点详情" : "查看位置"} <span aria-hidden="true">↗</span></a>}
        </div>
      </div>
    </li>;
  })}</ol>;
}
