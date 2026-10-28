import { AmapApiError, RequestTerminatedError } from "../amap/errors.js";
import { classifyFailure, publicSearchErrorMessage, publicStopCode } from "../errors/classify.js";
import { abortable, throwIfAborted, type RequestContext } from "../amap/request-context.js";
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

export interface SearchExecutionOptions {
  diagnostics?: Diagnostics;
  context?: RequestContext;
  onProgress?(results: readonly CategorySearchResult[]): void;
}

function toFailure(error: unknown): SearchFailure {
  const code = error instanceof AmapApiError && ["ADMISSION_WAIT_EXCEEDED", "ADMISSION_UNAVAILABLE", "DAILY_BUDGET_EXHAUSTED", "MONTHLY_BUDGET_EXHAUSTED", "REQUEST_DEADLINE_EXCEEDED", "UPSTREAM_AUTH_FAILED"].includes(error.code)
    ? publicStopCode(error) : undefined;
  return {
    message: code ? publicSearchErrorMessage(code) : "该类别暂时无法搜索，请稍后再试",
    ...(code ? { code } : {}),
    info: null,
    infocode: null
  };
}

function stoppedResults(results: readonly CategorySearchResult[], categories: readonly CategoryConfig[], error: AmapApiError): CategorySearchResult[] {
  return [...results, ...categories.slice(results.length).map((category, index): CategorySearchResult => ({
    category, status: index === 0 ? "error" : "skipped", places: [], page: null, error: index === 0 ? { ...toFailure(error), code: publicStopCode(error), message: publicSearchErrorMessage(publicStopCode(error)) } : null,
  }))];
}

function responseFor(request: ConfirmedSearchRequest, results: readonly CategorySearchResult[]): SearchResponse {
  const stopped = results.find(result => result.error?.code && result.error.code !== "ADMISSION_WAIT_EXCEEDED");
  return { resolvedLocation: request.resolvedLocation, categories: [...results],
    status: results.some(result => !isCategoryCompleted(result.status)) ? "partial success" : "success",
    ...(stopped?.error?.code ? { termination: { code: stopped.error.code, categoryId: stopped.category.key } } : {}) };
}

/** Synchronous snapshot when the lifecycle expires during an in-flight call. */
export function searchDeadlineResponse(request: ConfirmedSearchRequest, results: readonly CategorySearchResult[]): SearchResponse | undefined {
  if (!results.some(result => isCategoryCompleted(result.status))) return undefined;
  return responseFor(request, stoppedResults(results, request.categoryIds.map(getCategory), new RequestTerminatedError("REQUEST_DEADLINE_EXCEEDED")));
}

export async function searchCategoriesSequentially(
  centre: GeocodedPlace,
  categories: readonly CategoryConfig[],
  searchNearby: SearchClient["searchNearby"],
  radiusMeters: number,
  { diagnostics, context, onProgress }: SearchExecutionOptions = {}
): Promise<CategorySearchResult[]> {
  const results: CategorySearchResult[] = [];
  for (const [index, category] of categories.entries()) {
    try {
      context?.check?.();
      throwIfAborted(context?.signal);
      const response = await measureAsync(diagnostics, "search.category", () => abortable(searchNearby(centre, category, { radiusMeters, pageNumber: 1, pageSize: 25 }, context), context?.signal), { category: category.key });
      context?.check?.();
      throwIfAborted(context?.signal);
      const { places, ...page } = response;
      results.push({ category, status: deriveCategoryStatus(places, page), places, page, error: null });
    } catch (caught) {
      const error = context?.signal.aborted ? context.signal.reason : caught;
      const failure = classifyFailure(error);
      if (failure.nature === "internal") throw error;
      if (failure.scope === "request" && !(error instanceof AmapApiError && error.code === "REQUEST_DEADLINE_EXCEEDED")) {
        context?.abort(error as AmapApiError); throw error;
      }
      // All categories here share the nearby operation, admission and credential.
      if (failure.scope === "request" || failure.scope === "shared-resource") {
        const code = publicStopCode(error as AmapApiError);
        const completedCount = results.filter(item => isCategoryCompleted(item.status)).length;
        diagnostics?.event("search.category.completed", "search.category", { category: category.key, outcome: "error" });
        diagnostics?.event("search.stopped", "request", { category: category.key, code, completedCount, skippedCount: categories.length - index - 1 });
        if (failure.scope === "request") context?.abort(error as AmapApiError);
        if (completedCount === 0) throw error;
        diagnostics?.error(error, "search.category", true, { category: category.key });
        return stoppedResults(results, categories, error as AmapApiError);
      }
      diagnostics?.error(error, "search.category", true, { category: category.key });
      results.push({ category, status: "error", places: [], page: null, error: toFailure(error) });
    }
    diagnostics?.event("search.category.completed", "search.category", { category: category.key, outcome: results[results.length - 1]!.status });
    onProgress?.([...results]);
  }
  return results;
}

export async function executeSearch(request: SearchRequest, client: SearchClient, options: SearchExecutionOptions = {}): Promise<SearchResponse> {
  const { context } = options;
  context?.check?.();
  throwIfAborted(context?.signal);
  const resolvedLocation = await abortable(client.geocode(request.query, context), context?.signal);
  return executeResolvedSearch({ center: resolvedLocation, resolvedLocation, categoryIds: request.categoryIds, radiusMeters: request.radiusMeters }, client, options);
}

export async function executeResolvedSearch(request: ConfirmedSearchRequest, client: SearchClient, options: SearchExecutionOptions = {}): Promise<SearchResponse> {
  const categories = request.categoryIds.map(getCategory);
  const results = await searchCategoriesSequentially(request.resolvedLocation, categories, client.searchNearby.bind(client), request.radiusMeters, options);
  if (results.length > 0 && !results.some(result => isCategoryCompleted(result.status))) throw new AmapApiError("All categories failed", null, null, "ALL_CATEGORIES_FAILED");
  const response = responseFor(request, results);
  options.diagnostics?.event("search.completed", "request", { outcome: response.status });
  return response;
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
