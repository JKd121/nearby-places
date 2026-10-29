import { AmapApiError, RequestTerminatedError } from "../amap/errors.js";
import { classifyFailure, publicSearchErrorMessage, publicStopCode } from "../errors/classify.js";
import { abortable, createRequestContext, throwIfAborted, type RequestContext } from "../amap/request-context.js";
import { measureAsync, type Diagnostics } from "../diagnostics.js";
import { getCategory } from "../amap/categories.js";
import type { CategoryConfig, CategorySearchResult, Coordinates, GeocodedPlace, NearbySearchOptions, PlacePage, SearchFailure } from "../amap/types.js";
import type { ConfirmedSearchRequest, SearchRequest, SearchResponse, SearchSecondPageRequest, SearchSecondPageResponse } from "./contracts.js";
import { deriveCategoryStatus, isCategoryCompleted } from "./status.js";

export type Delay = (milliseconds: number, signal?: AbortSignal) => Promise<void>;
export interface SearchClient {
  geocode(query: string, context?: RequestContext): Promise<GeocodedPlace>;
  searchNearby(centre: Coordinates, category: CategoryConfig, options: NearbySearchOptions, context?: RequestContext): Promise<PlacePage>;
}
export interface SearchSnapshot {
  results: readonly CategorySearchResult[];
  active: readonly CategoryConfig["key"][];
  pending: readonly CategoryConfig["key"][];
  termination?: NonNullable<SearchResponse["termination"]>;
}
export interface SearchExecutionOptions {
  diagnostics?: Diagnostics;
  context?: RequestContext;
  concurrency?: 1 | 2;
  onProgress?(results: readonly CategorySearchResult[]): void;
  onSnapshot?(snapshot: SearchSnapshot): void;
}
function toFailure(error: unknown): SearchFailure {
  const code = error instanceof AmapApiError && ["ADMISSION_WAIT_EXCEEDED", "ADMISSION_UNAVAILABLE", "DAILY_BUDGET_EXHAUSTED", "MONTHLY_BUDGET_EXHAUSTED", "REQUEST_DEADLINE_EXCEEDED", "UPSTREAM_AUTH_FAILED"].includes(error.code) ? publicStopCode(error) : undefined;
  return { message: code ? publicSearchErrorMessage(code) : "该类别暂时无法搜索，请稍后再试", ...(code ? { code } : {}), info: null, infocode: null };
}
function failedCategory(category: CategoryConfig, error: unknown): CategorySearchResult {
  return { category, status: "error", places: [], page: null, error: toFailure(error) };
}
function skipped(category: CategoryConfig): CategorySearchResult { return { category, status: "skipped", places: [], page: null, error: null }; }
function responseFor(request: ConfirmedSearchRequest, results: readonly CategorySearchResult[], termination?: SearchResponse["termination"]): SearchResponse {
  return { resolvedLocation: request.resolvedLocation, categories: [...results], status: results.every(item => isCategoryCompleted(item.status)) ? "success" : "partial success", ...(termination ? { termination } : {}) };
}
export function searchDeadlineResponse(request: ConfirmedSearchRequest, progress: SearchSnapshot | readonly CategorySearchResult[]): SearchResponse | undefined {
  const snapshot: SearchSnapshot = "results" in progress ? progress : { results: progress, active: request.categoryIds.slice(progress.length, progress.length + 1), pending: request.categoryIds.slice(progress.length + 1) };
  if (!snapshot.results.length) return undefined;
  const done = new Map<string, CategorySearchResult>(snapshot.results.map(result => [result.category.key, result]));
  const error = new RequestTerminatedError("REQUEST_DEADLINE_EXCEEDED");
  const results = request.categoryIds.map(key => done.get(key) ?? (snapshot.active.includes(key) ? failedCategory(getCategory(key), error) : skipped(getCategory(key))));
  const categoryId = snapshot.active[0] ?? snapshot.pending[0];
  const termination = snapshot.termination ?? (categoryId ? { code: "REQUEST_DEADLINE_EXCEEDED" as const, categoryId: getCategory(categoryId).key } : undefined);
  return responseFor(request, results, termination);
}
async function runCategories(centre: GeocodedPlace, categories: readonly CategoryConfig[], searchNearby: SearchClient["searchNearby"], radiusMeters: number, options: SearchExecutionOptions) {
  const { diagnostics } = options;
  const slots: (CategorySearchResult | undefined)[] = Array(categories.length);
  const active = new Set<number>(); let next = 0;
  let stop: { error: AmapApiError; categoryId: CategoryConfig["key"]; priorSettled: number } | undefined;
  let stoppedWork = false;
  let fatal: unknown;
  const lifetime = createRequestContext(options.context), admission = new AbortController();
  let admissionTail = Promise.resolve();
  const gate = {
    signal: admission.signal,
    check() { throwIfAborted(admission.signal); },
    async run<T>(task: () => Promise<T>, signal: AbortSignal): Promise<T> {
      const previous = admissionTail;
      let release!: () => void;
      const turn = new Promise<void>(resolve => { release = resolve; });
      admissionTail = previous.then(() => turn);
      try { await abortable(previous, signal); gate.check(); return await task(); }
      finally { release(); }
    },
  };
  const snapshot = (): SearchSnapshot => ({ results: slots.filter((r): r is CategorySearchResult => !!r), active: [...active].sort((a,b)=>a-b).map(i=>categories[i]!.key), pending: categories.slice(next).map(c=>c.key), ...(stop && stoppedWork ? { termination: { code: publicStopCode(stop.error), categoryId: stop.categoryId } } : {}) });
  const publish = () => { const current = snapshot(); options.onSnapshot?.(current); options.onProgress?.(current.results); };
  const worker = async () => {
    while (next < categories.length && !stop && fatal === undefined) {
      const index = next++, category = categories[index]!;
      const child = createRequestContext(lifetime);
      let admissionFailed = false;
      child.admission = { ...gate, run: (task, signal) => gate.run(async () => {
        try { return await task(); }
        catch (error) {
          admissionFailed = true;
          if (classifyFailure(error).scope === "shared-resource") admission.abort(error);
          throw error;
        }
      }, signal) };
      active.add(index); publish();
      try {
        child.check();
        const response = await measureAsync(diagnostics, "search.category", () => abortable(searchNearby(centre, category, { radiusMeters, pageNumber: 1, pageSize: 25 }, child), child.signal), { category: category.key });
        child.check();
        const { places, ...page } = response;
        slots[index] = { category, status: deriveCategoryStatus(places, page), places, page, error: null };
      } catch (caught) {
        const error = child.signal.aborted ? child.signal.reason : caught;
        if (!admissionFailed && !child.signal.aborted && admission.signal.aborted && error === admission.signal.reason) {
          stoppedWork = true;
          slots[index] = skipped(category);
        }
        else {
          const failure = classifyFailure(error);
          if (failure.nature === "internal" || (failure.scope === "request" && (error as AmapApiError).code !== "REQUEST_DEADLINE_EXCEEDED")) {
            if (fatal === undefined) {
              fatal = error;
              if (error instanceof AmapApiError && failure.scope === "request") options.context?.abort(error);
            }
            lifetime.abort(error instanceof AmapApiError ? error : new RequestTerminatedError("REQUEST_CANCELLED"));
            admission.abort(error);
          } else {
            if ((failure.scope === "request" || failure.scope === "shared-resource") && !stop) {
              stop = { error: error as AmapApiError, categoryId: category.key, priorSettled: slots.filter(Boolean).length };
              stoppedWork ||= failure.scope === "request" || next < categories.length;
              admission.abort(error);
              if (failure.scope === "request") { options.context?.abort(error as AmapApiError); lifetime.abort(error as AmapApiError); }
            }
            slots[index] = failedCategory(category, error);
            diagnostics?.error(error, "search.category", true, { category: category.key });
          }
        }
      } finally {
        child.dispose(); active.delete(index);
        diagnostics?.event("search.category.completed", "search.category", { category: category.key, outcome: slots[index]?.status ?? "error" });
        publish();
      }
    }
  };
  publish();
  try {
    await Promise.all(Array.from({ length: Math.min(options.concurrency ?? 2, categories.length) }, worker));
    if (stop && stoppedWork) diagnostics?.event("search.stopped", "request", { category: stop.categoryId, code: publicStopCode(stop.error), completedCount: stop.priorSettled,
      skippedCount: categories.reduce((count, _category, index) => count + (!slots[index] || slots[index]?.status === "skipped" ? 1 : 0), 0) });
    if (fatal !== undefined) throw fatal;
    if (stop && !slots.some(r=>r && isCategoryCompleted(r.status)) && (stop.error.code !== "REQUEST_DEADLINE_EXCEEDED" || stop.priorSettled === 0)) throw stop.error;
    return { results: categories.map((category,index)=>slots[index] ?? skipped(category)), termination: stop && stoppedWork ? { code: publicStopCode(stop.error), categoryId: stop.categoryId } : undefined };
  } finally { lifetime.dispose(); }
}
/** Standalone CLI callers retain serial execution. */
export async function searchCategoriesSequentially(centre: GeocodedPlace, categories: readonly CategoryConfig[], searchNearby: SearchClient["searchNearby"], radiusMeters: number, options: SearchExecutionOptions = {}): Promise<CategorySearchResult[]> {
  return (await runCategories(centre, categories, searchNearby, radiusMeters, { ...options, concurrency: 1 })).results;
}
export async function executeSearch(request: SearchRequest, client: SearchClient, options: SearchExecutionOptions = {}): Promise<SearchResponse> {
  options.context?.check?.(); throwIfAborted(options.context?.signal);
  const resolvedLocation = await abortable(client.geocode(request.query, options.context), options.context?.signal);
  return executeResolvedSearch({ center: resolvedLocation, resolvedLocation, categoryIds: request.categoryIds, radiusMeters: request.radiusMeters }, client, options);
}
export async function executeResolvedSearch(request: ConfirmedSearchRequest, client: SearchClient, options: SearchExecutionOptions = {}): Promise<SearchResponse> {
  const run = await runCategories(request.resolvedLocation, request.categoryIds.map(getCategory), client.searchNearby.bind(client), request.radiusMeters, options);
  const response = responseFor(request, run.results, run.termination);
  options.diagnostics?.event("search.completed", "request", { outcome: response.status }); return response;
}

export async function executeSecondPageSearch(request: SearchSecondPageRequest, client: SearchClient, context?: RequestContext): Promise<SearchSecondPageResponse> {
  context?.check?.();
  throwIfAborted(context?.signal);
  const category = getCategory(request.categoryId);
  const page = await abortable(client.searchNearby(request.center, category, { radiusMeters: request.radiusMeters, pageNumber: 2, pageSize: 25 }, context), context?.signal);
  context?.check?.();
  throwIfAborted(context?.signal);
  return { categoryId: category.key, page };
}
