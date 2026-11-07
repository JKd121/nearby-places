"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import WorkspaceShell, { type WorkspaceView } from "./ui/WorkspaceShell";
import { Badge, EmptyState, Feedback, LoadingState } from "./ui/Feedback";
import { Icon } from "./ui/icons";
import { CandidateList, CategorySelector, HistoryView, PersonalCenter } from "./SearchPanels";
import s from "./search-workspace.module.css";
import { useSearchHistory } from "./useSearchHistory";
import type { SearchHistoryItem, SearchHistoryInput } from "./search-history-store";
import { isSearchHistoryItem } from "./search-history-store";
import { copyConfirmedLocation } from "../history/validation";
import type { CategoryKey, GeocodedPlace } from "../amap/types";
import type { LocationCandidate } from "../location/types";
import type { SearchRadius, SearchResponse, SearchSecondPageResponse, SearchProgress } from "../search/contracts";
import { isCategoryCompleted } from "../search/status";
import { CategoryResults } from "./CategoryResults";
import { readSearchStream } from "./search-stream";
import {
  ALLOWED_RADIUS_METERS, ALL_CATEGORY_IDS,
  canRequestSecondProviderPage, getCategoryResult, getCategoryCounts,
  getPlacesForFilter, mergeProviderPageResult, selectAllCategories,
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

export default function SearchApp({ identityKind = "account", sessionId, personal, activeView, onViewChange, credentialIssue, onRequestSettled }: { identityKind?: "guest" | "account"; sessionId?: string; personal?: ReactNode; activeView?: WorkspaceView; onViewChange?: (view: WorkspaceView) => void; credentialIssue?: boolean; onRequestSettled?: () => void } = {}) {
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
  const [progress, setProgress] = useState<SearchProgress | null>(null);
  const [searchVersion, setSearchVersion] = useState(0);
  const [loadingProviderCategory, setLoadingProviderCategory] = useState<CategoryKey | null>(null);
  const [providerPageErrors, setProviderPageErrors] = useState<Partial<Record<CategoryKey, string>>>({});
  const history = useSearchHistory(identityKind, sessionId);
  const [localView, setLocalView] = useState<WorkspaceView>("explore");
  const view = activeView ?? localView;
  const setView = onViewChange ?? setLocalView;
  const [conditionsOpen, setConditionsOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const providerPageBusy = useRef(false);
  const counts = useMemo(() => getCategoryCounts(response?.categories ?? []), [response]);
  const successfulCount = counts.completed;

  function invalidateRequests(): void {
    requestId.current += 1;
    activeRequest.current?.abort();
    activeRequest.current = null;
    providerPageBusy.current = false;
  }

  function beginRequest(): AbortController {
    invalidateRequests();
    const controller = new AbortController();
    activeRequest.current = controller;
    return controller;
  }

  useEffect(() => () => invalidateRequests(), []);

  function resetView(): void {
    setResponse(null); setProgress(null); setPublicError(null); setLoadingProviderCategory(null); setProviderPageErrors({});
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
      const result = await fetch("/api/resolve-location", { signal: controller.signal, method: "POST", headers: { ...(sessionId ? { "x-nearby-session": sessionId } : {}), "content-type": "application/json" }, body: JSON.stringify({ query: trimmed }) });
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
      if (!controller.signal.aborted) onRequestSettled?.();
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
    resetView();
    setSearchVersion(current => current + 1);
    setProgress({ results: [], active: [], pending: snapshot.categoryIds });
    setPhase("searching"); setPublicError(null);
    try {
      const searchLocation: GeocodedPlace = { query: snapshot.query.trim(), formattedAddress: location.address ?? location.name, province: null, city: location.city, district: location.district, level: location.placeType, longitude: location.location.longitude, latitude: location.location.latitude };
      const historyInput: SearchHistoryInput = {
        query: searchLocation.query,
        categoryIds: [...snapshot.categoryIds],
        radiusMeters: snapshot.radiusMeters,
        confirmedLocation: copyConfirmedLocation(location),
      };
      const result = await fetch("/api/search", { signal: controller.signal, method: "POST", headers: { ...(sessionId ? { "x-nearby-session": sessionId } : {}), "content-type": "application/json", "accept": "application/x-ndjson" }, body: JSON.stringify({ center: { longitude: location.location.longitude, latitude: location.location.latitude }, resolvedLocation: searchLocation, categoryIds: snapshot.categoryIds, radiusMeters: snapshot.radiusMeters }) });
      if (!result.ok) {
        const errorPayload = await readJson(result) as { error?: PublicApiError } | null;
        throw new Error(errorPayload?.error?.message ?? "周边搜索失败");
      }
      const payload = result.headers.get("content-type")?.includes("application/x-ndjson")
        ? await readSearchStream(result, current => {
          if (controller.signal.aborted || currentId !== requestId.current) return;
          setProgress(current);
          setResponse({ resolvedLocation: searchLocation, categories: [...current.results], status: "partial success", ...(current.termination ? { termination: current.termination } : {}) });
        }, controller.signal)
        : await readJson(result) as SearchResponse | null;
      if (controller.signal.aborted || currentId !== requestId.current) return;
      if (!payload?.categories) throw new Error("周边搜索失败");
      setResponse(payload);
      setProgress(null);
      setPhase("results");
      if (payload.categories.some(category => isCategoryCompleted(category.status))) void history.save(historyInput);
    } catch (error) {
      if (controller.signal.aborted || currentId !== requestId.current) return;
      setPublicError(error instanceof Error ? error.message : "周边搜索失败"); setPhase("search-error");
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
      if (!controller.signal.aborted) onRequestSettled?.();
    }
  }

  async function loadProviderPage(categoryId: CategoryKey): Promise<number | null> {
    const categoryResult = getCategoryResult(response, categoryId);
    if (!response || phase !== "results" || !canRequestSecondProviderPage(categoryResult) || providerPageBusy.current) return null;
    const controller = beginRequest();
    const currentId = requestId.current;
    providerPageBusy.current = true;
    setLoadingProviderCategory(categoryId);
    setProviderPageErrors(current => {
      const { [categoryId]: _cleared, ...remaining } = current;
      return remaining;
    });
    try {
      const result = await fetch("/api/search/page", { signal: controller.signal, method: "POST", headers: { ...(sessionId ? { "x-nearby-session": sessionId } : {}), "content-type": "application/json" }, body: JSON.stringify({ center: { longitude: response.resolvedLocation.longitude, latitude: response.resolvedLocation.latitude }, categoryId, radiusMeters }) });
      const payload = await readJson(result) as (SearchSecondPageResponse & { error?: PublicApiError }) | null;
      if (controller.signal.aborted || currentId !== requestId.current) return null;
      if (!result.ok || !payload?.page || payload.categoryId !== categoryId) throw new Error(payload?.error?.message ?? "获取更多地点失败");
      setResponse(current => current ? mergeProviderPageResult(current, categoryId, payload.page) : current);
      return getCategoryResult(mergeProviderPageResult(response, categoryId, payload.page), categoryId)?.places.length ?? null;
    } catch (error) {
      if (controller.signal.aborted || currentId !== requestId.current) return null;
      setProviderPageErrors(current => ({ ...current, [categoryId]: error instanceof Error ? error.message : "获取更多地点失败" }));
      return null;
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
      if (!controller.signal.aborted) onRequestSettled?.();
      if (currentId === requestId.current) { providerPageBusy.current = false; setLoadingProviderCategory(null); }
    }
  }

  const busy = phase === "resolving" || phase === "searching";
  const candidatePhase = phase === "needs-confirmation";
  const allCount = response ? getPlacesForFilter(response, "all").length : null;
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [searchVersion]);
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
        <div className={s.metric}><span className={s.metricIcon} data-color="lilac"><Icon name="search" /></span><div><span>本次已获取</span><strong>{(phase === "results" || phase === "searching" || phase === "search-error") && successfulCount > 0 && allCount !== null ? allCount + " 个地点" : "—"}</strong></div></div>
      </div>
      <div className={s.searchColumns}>
        <section className={s.mainPanel} aria-labelledby="search-panel-title">
          <div className={s.panelHeading}><div><h2 id="search-panel-title" tabIndex={-1}>{candidatePhase ? "请确认搜索中心" : "附近结果"}</h2><p>{candidatePhase ? "选择你想搜索的位置，附近服务将以此为中心。" : "围绕已确认的搜索中心"}</p></div>{candidatePhase && <Badge tone="warning">{candidates.length} 个候选</Badge>}</div>
          <div ref={scrollRef} className={s.listViewport} role="region" tabIndex={0} aria-label={candidatePhase ? "候选地点列表" : "附近结果列表"} aria-busy={phase === "resolving"}>
            {credentialIssue && <Feedback tone="warning" title="请配置高德 Key" action={<button type="button" onClick={() => navigate("personal")}>前往个人中心</button>}>添加或更换可用的 Key 后，即可搜索附近。</Feedback>}
            {phase === "initial" && !credentialIssue && <EmptyState title="从一个地点开始">输入地名或地址，确认搜索中心后发现附近生活服务。</EmptyState>}
            {phase === "resolving" && <LoadingState>正在查找可能的地点…</LoadingState>}
            {candidatePhase && <CandidateList candidates={candidates} expanded={showAllCandidates} onExpand={() => setShowAllCandidates(true)} onSelect={confirmCandidate} />}
            {phase === "not-found" && <EmptyState title="没有找到明确地点">请补充城市、行政区或更完整的地点名称，再次解析。</EmptyState>}
            {phase === "resolve-error" && <Feedback tone="error" title="地点解析未完成" action={<button type="button" onClick={resolveLocation}>重新解析</button>}>{publicError}</Feedback>}
            {phase === "resolved" && <EmptyState title="搜索中心已确认">在右侧选择服务类别和半径，点击“搜索附近”。</EmptyState>}
            {phase === "search-error" && <Feedback tone="error" title="附近搜索未完成" action={<button type="button" onClick={searchNearby} disabled={!resolvedLocation || selectedCategoryIds.length === 0}>重新搜索</button>}>{publicError}</Feedback>}
            {(phase === "searching" || phase === "results" || phase === "search-error") && <CategoryResults key={searchVersion} categoryIds={selectedCategoryIds} response={response} progress={progress} searching={phase === "searching"} interrupted={phase === "search-error"} loadingCategory={loadingProviderCategory} pageErrors={providerPageErrors} onLoadPage={loadProviderPage} />}
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
    {view === "personal" && (personal ?? <PersonalCenter />)}
  </WorkspaceShell>;
}
