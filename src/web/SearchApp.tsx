"use client";

import { useMemo, useRef, useState } from "react";
import { CATEGORIES } from "../amap/categories";
import type { CategoryKey, CategorySearchResult, GeocodedPlace, Place } from "../amap/types";
import type { LocationCandidate } from "../location/types";
import type { SearchRadius, SearchResponse } from "../search/contracts";
import type { SortMode } from "../search/sort";
import {
  ALLOWED_RADIUS_METERS, ALL_CATEGORY_IDS, CATEGORY_GROUPS, clearCategories,
  ensureValidSortMode, formatCost, formatDistance, formatRating, getAllowedSortModes,
  getAvailableFilters, getCategoryResult, getGroupSelection, getInitialVisibleCount,
  getNextVisibleCount, getPlacesForFilter, resetSearchView, selectAllCategories,
  sortPlacesForFilter, toggleCategory, toggleGroup, truncateTag, type ActiveFilter,
} from "./logic";

type Phase = "initial" | "resolving" | "needs-confirmation" | "resolved" | "not-found" | "searching" | "results" | "resolve-error" | "search-error";
interface PublicApiError { message?: string; }
interface ResolutionApiResponse { status?: "confirmed" | "needs_confirmation" | "not_found"; location?: LocationCandidate; candidates?: LocationCandidate[]; error?: PublicApiError; }

function categoryLabel(key: CategoryKey): string { return CATEGORIES.find((category) => category.key === key)?.label ?? key; }
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

  function resetView(): void {
    const next = resetSearchView();
    setResponse(null); setActiveFilter(next.activeFilter); setSortMode(next.sortMode); setVisibleCount(next.visibleCount); setPublicError(null);
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
      const result = await fetch("/api/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ center: { longitude: resolvedLocation.location.longitude, latitude: resolvedLocation.location.latitude }, resolvedLocation: searchLocation, categoryIds: selectedCategoryIds, radiusMeters }) });
      const payload = await readJson(result) as (SearchResponse & { error?: PublicApiError }) | null;
      if (currentId !== requestId.current) return;
      if (!result.ok || !payload?.categories) throw new Error(payload?.error?.message ?? "周边搜索失败");
      setResponse(payload); setActiveFilter("all"); setSortMode("distance-asc"); setVisibleCount(getInitialVisibleCount("all")); setPhase("results");
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

  const noCategoriesSelected = selectedCategoryIds.length === 0;
  return <>
    <header className="page-header"><h1>地点周边</h1><p className="subtitle">搜索一个地点，比较附近的生活服务。</p></header>
    <section className="search-panel" aria-busy={phase === "resolving" || phase === "searching"}>
      <label htmlFor="location-query">地点</label>
      <div className="input-row"><div className="input-shell"><input ref={inputRef} id="location-query" value={query} onChange={(event) => invalidateLocation(event.target.value)} placeholder="例如：深圳北站" disabled={phase === "resolving" || phase === "searching"} />{query.length > 0 && <button type="button" className="clear-input-button" aria-label="清空地点" onClick={clearQuery} disabled={phase === "resolving" || phase === "searching"}>×</button>}</div><button type="button" onClick={resolveLocation} disabled={phase === "resolving" || phase === "searching"}>{phase === "resolving" ? "解析中…" : "解析地点"}</button></div>
      {publicError && (phase === "resolve-error" || phase === "search-error") && <p className="error-text" role="alert">{publicError}</p>}
    </section>
    {phase === "not-found" && <section className="resolution-message" aria-live="polite"><strong>没有找到明确地点</strong><p>请尝试补充城市、行政区或更完整的地点名称。</p></section>}
    {phase === "needs-confirmation" && <CandidateList candidates={candidates} expanded={showAllCandidates} onExpand={() => setShowAllCandidates(true)} onSelect={confirmCandidate} />}
    {resolvedLocation && <>
      <section className="location-confirmation" aria-live="polite"><div className="location-heading"><p className="section-kicker">已确认地点</p><button type="button" className="secondary location-edit" onClick={clearResolved} disabled={phase === "searching"}>修改地点</button></div><h2>{resolvedLocation.name}</h2>{resolvedLocation.placeType && <p>{resolvedLocation.placeType}</p>}<p>{[resolvedLocation.city, resolvedLocation.district].filter(Boolean).join(" · ") || "行政区未知"}</p>{resolvedLocation.address && <p>{resolvedLocation.address}</p>}<p className="coordinates">{resolvedLocation.location.longitude}, {resolvedLocation.location.latitude}</p></section>
      <section className="controls-panel" aria-label="搜索条件">
        <CategorySelector selected={selectedCategoryIds} onChange={changeCategories} />
        <fieldset className="radius-selector"><legend>搜索半径</legend><div className="option-row">{ALLOWED_RADIUS_METERS.map((value) => <label key={value} className="option-pill"><input type="radio" name="radius" value={value} checked={radiusMeters === value} onChange={(event) => changeRadius(event.target.value)} />{value / 1000} km</label>)}</div></fieldset>
        {noCategoriesSelected && <p className="control-hint" role="status">至少选择一个类别后才能搜索。</p>}
        <button type="button" onClick={searchNearby} disabled={phase === "searching" || noCategoriesSelected}>{phase === "searching" ? "正在搜索…" : "搜索附近"}</button>
      </section>
    </>}
    {phase === "searching" && <p className="progress-text" role="status"><span className="spinner" aria-hidden="true" />正在依次搜索 {selectedCategoryIds.length} 个类别…</p>}
    {response && <ResultsView response={response} activeFilter={activeFilter} availableFilters={availableFilters} activeResult={activeResult} allowedSortModes={allowedSortModes} sortMode={effectiveSortMode} onFilterChange={changeFilter} onSortChange={changeSort} places={visiblePlaces} totalPlaces={sortedPlaces.length} canLoadMore={canLoadMore} onLoadMore={loadMore} successfulCount={successfulCount} failedCount={failedCount} />}
  </>;
}

function CandidateList({ candidates, expanded, onExpand, onSelect }: { candidates: readonly LocationCandidate[]; expanded: boolean; onExpand: () => void; onSelect: (candidate: LocationCandidate) => void }) {
  const visibleCandidates = expanded ? candidates : candidates.slice(0, 5);
  return <section className="candidate-panel" aria-live="polite"><h2>{candidates.length > 1 ? "找到多个可能的地点" : "请确认你想搜索的位置"}</h2><p className="muted">请选择你想搜索的位置</p><div className="candidate-list">{visibleCandidates.map((candidate, index) => <button type="button" className="candidate-button" key={`${candidate.id ?? candidate.name}-${index}`} onClick={() => onSelect(candidate)}><strong>{candidate.name}</strong>{candidate.placeType && <span>{candidate.placeType}</span>}<span>{[candidate.city, candidate.district].filter(Boolean).join(" · ") || "行政区未知"}</span>{candidate.address && <span>{candidate.address}</span>}</button>)}</div>{!expanded && candidates.length > 5 && <button type="button" className="secondary candidate-more" onClick={onExpand}>查看更多地点</button>}</section>;
}

function CategorySelector({ selected, onChange }: { selected: readonly CategoryKey[]; onChange: (next: CategoryKey[]) => void }) {
  return <fieldset className="category-selector"><legend>服务类别</legend><div className="selection-actions"><button type="button" className="secondary" onClick={() => onChange(selectAllCategories())}>全选</button><button type="button" className="secondary" onClick={() => onChange(clearCategories())}>清空</button><span>{selected.length}/{ALL_CATEGORY_IDS.length} 已选</span></div>{CATEGORY_GROUPS.map((group) => { const selection = getGroupSelection(selected, group.categoryIds); return <div className="category-group" key={group.key}><div className="category-group-heading"><strong>{group.label}</strong><button type="button" className="text-button" aria-pressed={selection === "all"} data-selection={selection} onClick={() => onChange(toggleGroup(selected, group.categoryIds))}>{selection === "all" ? "取消整组" : "选中整组"}</button></div><div className="category-options">{group.categoryIds.map((key) => <label className="checkbox-option" key={key}><input type="checkbox" checked={selected.includes(key)} onChange={() => onChange(toggleCategory(selected, key))} />{categoryLabel(key)}</label>)}</div></div>; })}</fieldset>;
}

function ResultsView({ response, activeFilter, availableFilters, activeResult, allowedSortModes, sortMode, onFilterChange, onSortChange, places, totalPlaces, canLoadMore, onLoadMore, successfulCount, failedCount }: { response: SearchResponse; activeFilter: ActiveFilter; availableFilters: ActiveFilter[]; activeResult: CategorySearchResult | null; allowedSortModes: SortMode[]; sortMode: SortMode; onFilterChange: (filter: ActiveFilter) => void; onSortChange: (mode: SortMode) => void; places: Place[]; totalPlaces: number; canLoadMore: boolean; onLoadMore: () => void; successfulCount: number; failedCount: number }) {
  const resultCount = activeFilter === "all" ? totalPlaces : activeResult?.places.length ?? 0;
  return <section className="results" aria-live="polite"><div className="results-summary"><div><h2>附近结果</h2><p>{activeFilter === "all" ? `共找到 ${resultCount} 个结果` : `${categoryLabel(activeFilter)} · ${resultCount} 个结果`}</p></div><p>{successfulCount} 个类别成功{failedCount > 0 ? ` · ${failedCount} 个类别失败` : ""}</p></div><div className="result-toolbar"><div className="filter-row" role="tablist" aria-label="结果类别">{availableFilters.map((filter) => { const item = filter === "all" ? null : response.categories.find((entry) => entry.category.key === filter); return <button type="button" role="tab" aria-selected={activeFilter === filter} className={activeFilter === filter ? "filter-button active" : "filter-button"} key={filter} onClick={() => onFilterChange(filter)}>{filter === "all" ? "全部" : categoryLabel(filter)}{item?.status === "error" ? " · 失败" : item?.status === "empty" ? " · 空" : ""}</button>; })}</div><label className="sort-control">排序<select value={sortMode} onChange={(event) => onSortChange(event.target.value as SortMode)}>{allowedSortModes.map((mode) => <option value={mode} key={mode}>{sortLabel(mode)}</option>)}</select></label></div>{activeFilter !== "all" && activeResult?.status === "error" && <p className="error-text" role="alert">{activeResult.error?.message ?? "该类别暂时无法搜索"}</p>}{activeFilter !== "all" && activeResult?.status === "empty" && <p className="muted">该类别暂无附近结果。</p>}{(activeFilter === "all" || activeResult?.status === "success") && <><PlaceList places={places} /><div className="load-more-row">{canLoadMore && <button type="button" className="secondary" onClick={onLoadMore}>加载更多（已显示 {places.length}/{totalPlaces}）</button>}</div></>}</section>;
}

function PlaceList({ places }: { places: Place[] }) {
  return <ol className="place-list">{places.map((place) => { const cost = formatCost(place.category, place.cost); const tag = truncateTag(place.tag); return <li className="place-row" key={`${place.category}-${place.id}`}><div className="place-main"><div className="place-title-row"><h4>{place.name}</h4><span className="place-distance">{formatDistance(place.distanceMeters)}</span></div><p className="place-meta"><span>{categoryLabel(place.category)}</span> · <span>{formatRating(place.rating)}</span>{cost && <> · <span className={place.category === "gym" ? "place-cost place-cost-weak" : "place-cost"}>{cost}</span></>}</p>{tag && <p className="place-tag">{tag}</p>}<p className="place-address">{place.address || "地址暂无"}</p></div></li>; })}</ol>;
}
