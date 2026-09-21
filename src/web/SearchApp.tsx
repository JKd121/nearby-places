"use client";

import { useMemo, useRef, useState } from "react";
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

function categoryLabel(key: CategoryKey): string { return CATEGORIES.find((category) => category.key === key)?.label ?? key; }
async function readJson(response: Response): Promise<unknown> { try { return await response.json(); } catch { return null; } }
function sortLabel(mode: SortMode): string { return { "distance-asc": "距离最近", "rating-desc": "评分最高", "cost-asc": "消费最低", "cost-desc": "消费最高" }[mode]; }

type SearchHistoryInput = {
  query: string;
  categoryIds: CategoryKey[];
  radiusMeters: SearchRadius;
};

async function saveSearchHistoryBestEffort(
  input: SearchHistoryInput,
): Promise<void> {
  try {
    const result = await fetch("/api/history", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!result.ok) {
      console.warn("Failed to save search history");
    }
  } catch (error) {
    console.warn("Failed to save search history", error);
  }
}

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
  const requestId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

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
    setQuery(nextQuery);
    requestId.current += 1;
    setResolvedLocation(null); setResolvedQuery(null); setCandidates([]); setShowAllCandidates(false); setPublicError(null); setPhase("initial"); resetView();
  }

  function clearQuery(): void {
    invalidateLocation("");
    inputRef.current?.focus();
  }

  function changeCategories(next: CategoryKey[]): void { requestId.current += 1; setSelectedCategoryIds(next); resetView(); if (resolvedLocation) setPhase("resolved"); }

  function changeRadius(next: string): void {
    const value = Number(next) as SearchRadius;
    if (!ALLOWED_RADIUS_METERS.includes(value as (typeof ALLOWED_RADIUS_METERS)[number])) return;
    requestId.current += 1; setRadiusMeters(value); resetView(); if (resolvedLocation) setPhase("resolved");
  }

  async function resolveLocation(): Promise<void> {
    const trimmed = query.trim();
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
      if (payload?.status !== "confirmed" || !payload.location) throw new Error("地点解析失败");
      setResolvedLocation(payload.location); setResolvedQuery(trimmed); setPhase("resolved");
    } catch (error) {
      if (currentId !== requestId.current) return;
      setPublicError(error instanceof Error ? error.message : "地点解析失败"); setPhase("resolve-error");
    }
  }

  function confirmCandidate(candidate: LocationCandidate): void {
    requestId.current += 1;
    setResolvedLocation(candidate); setResolvedQuery(query.trim()); setCandidates([]); setShowAllCandidates(false); setPublicError(null); setPhase("resolved"); resetView();
  }

  function clearResolved(): void { requestId.current += 1; setResolvedLocation(null); setResolvedQuery(null); setCandidates([]); setShowAllCandidates(false); resetView(); setPublicError(null); setPhase("initial"); }

  async function searchNearby(): Promise<void> {
    if (!resolvedLocation || selectedCategoryIds.length === 0) return;
    const currentId = requestId.current + 1; requestId.current = currentId;
    setPhase("searching"); setPublicError(null);
    try {
      const searchLocation: GeocodedPlace = { query: resolvedQuery ?? query.trim(), formattedAddress: resolvedLocation.address ?? resolvedLocation.name, province: null, city: resolvedLocation.city, district: resolvedLocation.district, level: resolvedLocation.placeType, longitude: resolvedLocation.location.longitude, latitude: resolvedLocation.location.latitude };
      const historyInput: SearchHistoryInput = {
            query: searchLocation.query,
            categoryIds: [...selectedCategoryIds],
            radiusMeters,
          };
      const result = await fetch("/api/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ center: { longitude: resolvedLocation.location.longitude, latitude: resolvedLocation.location.latitude }, resolvedLocation: searchLocation, categoryIds: selectedCategoryIds, radiusMeters }) });
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
  void saveSearchHistoryBestEffort(historyInput);
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
  return <>
    <header className="page-header"><div className="hero-topline"><div className="brand-lockup"><span className="brand-mark" aria-hidden="true">⌖</span><span>地点周边</span></div><span className="hero-microcopy">EXPLORE NEARBY · LIVE LOCAL</span></div><div className="hero-copy"><p className="eyebrow">把生活半径，放在一个清晰的地点上</p><h1>探索身边的美好</h1><p className="subtitle">输入地点，确认搜索中心，再发现附近值得去的生活服务。</p></div><ol className="flow-steps" aria-label="搜索流程"><li><span>01</span>输入地点</li><li><span>02</span>确认位置</li><li><span>03</span>发现附近</li></ol><div className="hero-orbit" aria-hidden="true"><span className="orbit-ring orbit-ring-one" /><span className="orbit-ring orbit-ring-two" /><span className="orbit-pin">⌖</span></div></header>
    <section className="search-panel" aria-busy={phase === "resolving" || phase === "searching"}>
      <div className="search-panel-heading"><div><p className="section-kicker">搜索中心</p><h2>搜索一个地点</h2></div></div><label htmlFor="location-query">地点</label>
      <div className="input-row"><div className="input-shell"><span className="search-field-icon" aria-hidden="true">⌖</span><input ref={inputRef} id="location-query" value={query} onChange={(event) => invalidateLocation(event.target.value)} placeholder="例如：深圳北站" disabled={phase === "resolving" || phase === "searching"} />{query.length > 0 && <button type="button" className="clear-input-button" aria-label="清空地点" onClick={clearQuery} disabled={phase === "resolving" || phase === "searching"}>×</button>}</div><button type="button" onClick={resolveLocation} disabled={phase === "resolving" || phase === "searching"}><span aria-hidden="true">↗</span>{phase === "resolving" ? "解析中…" : "解析地点"}</button></div>
      {publicError && (phase === "resolve-error" || phase === "search-error") && <p className="error-text" role="alert">{publicError}</p>}
    </section>
    {phase === "not-found" && <section className="resolution-message" aria-live="polite"><strong>没有找到明确地点</strong><p>请尝试补充城市、行政区或更完整的地点名称。</p></section>}
    {phase === "needs-confirmation" && <CandidateList candidates={candidates} expanded={showAllCandidates} onExpand={() => setShowAllCandidates(true)} onSelect={confirmCandidate} />}
    {resolvedLocation && <>
      <section className="location-confirmation" aria-live="polite"><div className="location-heading"><div className="location-status"><span className="status-dot" aria-hidden="true" /><p className="section-kicker">已锁定搜索中心</p></div><button type="button" className="secondary location-edit" onClick={clearResolved} disabled={phase === "searching"}><span aria-hidden="true">↗</span>修改地点</button></div><div className="location-identity"><span className="location-pin" aria-hidden="true">⌖</span><div><h2>{resolvedLocation.name}</h2>{resolvedLocation.placeType && <p className="location-type">{resolvedLocation.placeType}</p>}</div></div><p className="location-region">{[resolvedLocation.city, resolvedLocation.district].filter(Boolean).join(" · ") || "行政区未知"}</p>{resolvedLocation.address && <p className="location-address">{resolvedLocation.address}</p>}<p className="coordinates">{resolvedLocation.location.longitude}, {resolvedLocation.location.latitude}</p></section>
      <section className="controls-panel" aria-label="搜索条件"><div className="controls-heading"><div><p className="section-kicker">发现范围</p><h2>附近生活服务</h2></div></div>
        <CategorySelector selected={selectedCategoryIds} onChange={changeCategories} />
        {noCategoriesSelected && <p className="control-hint" role="status">至少选择一个类别后才能搜索。</p>}
        <div className="controls-footer"><fieldset className="radius-selector"><legend>搜索半径</legend><div className="option-row">{ALLOWED_RADIUS_METERS.map((value) => <label key={value} className="option-pill"><input type="radio" name="radius" value={value} checked={radiusMeters === value} onChange={(event) => changeRadius(event.target.value)} />{value / 1000} km</label>)}</div></fieldset><button type="button" onClick={searchNearby} disabled={phase === "searching" || noCategoriesSelected}>{phase === "searching" ? "正在搜索…" : "搜索附近"}</button></div>
      </section>
    </>}
    {phase === "searching" && <p className="progress-text" role="status"><span className="spinner" aria-hidden="true" />正在依次搜索 {selectedCategoryIds.length} 个类别…</p>}
    {response && <ResultsView response={response} activeFilter={activeFilter} availableFilters={availableFilters} activeResult={activeResult} providerPageResult={providerPageResult} allowedSortModes={allowedSortModes} sortMode={effectiveSortMode} onFilterChange={changeFilter} onSortChange={changeSort} places={visiblePlaces} totalPlaces={sortedPlaces.length} canLoadMore={canLoadMore} canRequestProviderPage={canRequestProviderPage} canAnyCategoryRequestProviderPage={canAnyCategoryRequestProviderPage} providerPageLoading={providerPageCategory !== null && loadingProviderCategory === providerPageCategory} providerPageError={providerPageCategory ? providerPageErrors[providerPageCategory] ?? null : null} onLoadMore={loadMore} onLoadProviderPage={loadProviderPage} successfulCount={successfulCount} failedCount={failedCount} />}
  </>;
}

function CandidateList({ candidates, expanded, onExpand, onSelect }: { candidates: readonly LocationCandidate[]; expanded: boolean; onExpand: () => void; onSelect: (candidate: LocationCandidate) => void }) {
  const visibleCandidates = expanded ? candidates : candidates.slice(0, 5);
  return <section className="candidate-panel" aria-live="polite"><div className="candidate-heading"><div><p className="section-kicker">位置确认</p><h2>{candidates.length > 1 ? "找到多个可能的地点" : "请确认你想搜索的位置"}</h2></div><span className="candidate-count">{candidates.length} 个候选</span></div><p className="muted">选择最符合你意图的地点，附近搜索会以它为中心。</p><div className="candidate-list">{visibleCandidates.map((candidate, index) => <button type="button" className="candidate-button" key={`${candidate.id ?? candidate.name}-${index}`} onClick={() => onSelect(candidate)}><span className="candidate-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><span className="candidate-content"><strong>{candidate.name}</strong>{candidate.placeType && <span className="candidate-type">{candidate.placeType}</span>}<span>{[candidate.city, candidate.district].filter(Boolean).join(" · ") || "行政区未知"}</span>{candidate.address && <span>{candidate.address}</span>}</span><span className="candidate-arrow" aria-hidden="true">↗</span></button>)}</div>{!expanded && candidates.length > 5 && <button type="button" className="secondary candidate-more" onClick={onExpand}>查看更多地点</button>}</section>;
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
  return <section className="results" aria-live="polite"><div className="results-summary"><div><p className="section-kicker">附近发现</p><h2>附近结果</h2><p>{activeFilter === "all" ? `共找到 ${resultCount} 个结果` : `${categoryLabel(activeFilter)} · ${resultCount} 个结果`}</p></div><div className="result-stat"><strong>{resultCount}</strong><span>{successfulCount} 类成功{failedCount > 0 ? ` · ${failedCount} 类失败` : ""}</span></div></div><div className="result-toolbar"><div className="filter-row" role="tablist" aria-label="结果类别">{availableFilters.map((filter) => { const item = filter === "all" ? null : response.categories.find((entry) => entry.category.key === filter); return <button type="button" role="tab" aria-selected={activeFilter === filter} className={activeFilter === filter ? "filter-button active" : "filter-button"} key={filter} onClick={() => onFilterChange(filter)}>{filter === "all" ? "全部" : categoryLabel(filter)}{item?.status === "error" ? " · 失败" : item?.status === "empty" ? " · 空" : ""}</button>; })}</div><label className="sort-control"><span>排序</span><select value={sortMode} onChange={(event) => onSortChange(event.target.value as SortMode)}>{allowedSortModes.map((mode) => <option value={mode} key={mode}>{sortLabel(mode)}</option>)}</select></label></div>{activeFilter !== "all" && activeResult?.status === "error" && <p className="error-text" role="alert">{activeResult.error?.message ?? "该类别暂时无法搜索"}</p>}{activeFilter !== "all" && activeResult?.status === "empty" && <p className="muted">{getEmptyStateMessage(activeFilter)}</p>}{(activeFilter === "all" || activeResult?.status === "success") && <><PlaceList places={places} /><div className="load-more-row">{canLoadMore && <button type="button" className="secondary" onClick={onLoadMore}><span aria-hidden="true">↘</span>加载更多（已显示 {places.length}/{totalPlaces}）</button>}{!canLoadMore && (canRequestProviderPage || providerPageLoading) && <button type="button" className="secondary" onClick={onLoadProviderPage} disabled={providerPageLoading}><span aria-hidden="true">↘</span>{providerPageLoading ? "正在获取更多地点…" : "获取更多附近结果"}</button>}{providerPageError && <p className="error-text" role="status">{providerPageError}</p>}{!canLoadMore && !canRequestProviderPage && !providerPageLoading && !providerPageError && <p className="muted" role="status">{exhaustedMessage}</p>}</div></>}</section>;
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
