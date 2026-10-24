import { AmapApiError, isRequestTerminal } from "../amap/errors.js";
import { abortable, cancellableDelay, throwIfAborted, type RequestContext } from "../amap/request-context.js";
import { measureAsync, type Diagnostics } from "../diagnostics.js";
import { getCategory } from "../amap/categories.js";
import type { CategoryConfig, CategorySearchResult, Coordinates, GeocodedPlace, NearbySearchOptions, PlacePage, SearchFailure } from "../amap/types.js";
import type { ConfirmedSearchRequest, SearchRequest, SearchResponse, SearchSecondPageRequest, SearchSecondPageResponse } from "./contracts.js";
import { deriveCategoryStatus } from "./status.js";

export type Delay = (milliseconds: number, signal?: AbortSignal) => Promise<void>;

export interface SearchClient {
  geocode(query: string, context?: RequestContext): Promise<GeocodedPlace>;
  searchNearby(centre: Coordinates, category: CategoryConfig, options: NearbySearchOptions, context?: RequestContext): Promise<PlacePage>;
}

const realDelay: Delay = cancellableDelay;

function toFailure(): SearchFailure {
  return {
    message: "该类别暂时无法搜索，请稍后再试",
    info: null,
    infocode: null
  };
}

export async function searchCategoriesSequentially(
  centre: GeocodedPlace,
  categories: readonly CategoryConfig[],
  searchNearby: SearchClient["searchNearby"],
  radiusMeters: number,
  delay: Delay = realDelay,
  intervalMilliseconds = 500,
  diagnostics?: Diagnostics,
  context?: RequestContext
): Promise<CategorySearchResult[]> {
  const results: CategorySearchResult[] = [];
  for (const [index, category] of categories.entries()) {
    throwIfAborted(context?.signal);
    try {
      const response = await measureAsync(diagnostics, "search.category", () => abortable(searchNearby(centre, category, { radiusMeters, pageNumber: 1, pageSize: 25 }, context), context?.signal), { category: category.key });
      throwIfAborted(context?.signal);
      const { places, ...page } = response;
      results.push({ category, status: deriveCategoryStatus(places, page), places, page, error: null });
    } catch (error) {
      throwIfAborted(context?.signal);
      if (isRequestTerminal(error)) { context?.abort(error); throw error; }
      // Keep the transport error identity so diagnostic timing/annotations survive.
      diagnostics?.error(error instanceof AmapApiError ? error : new Error("Category failed"), "search.category", true, { category: category.key });
      results.push({ category, status: "error", places: [], page: null, error: toFailure() });
    }
    diagnostics?.event("search.category.completed", "search.category", { category: category.key, outcome: results[results.length - 1]!.status });
    if (index < categories.length - 1) await measureAsync(diagnostics, "search.inter_category_wait", () => abortable(delay(intervalMilliseconds, context?.signal), context?.signal), { scheduledMs: intervalMilliseconds });
  }
  throwIfAborted(context?.signal);
  return results;
}

export async function executeSearch(request: SearchRequest, client: SearchClient, delay: Delay = realDelay, context?: RequestContext): Promise<SearchResponse> {
  throwIfAborted(context?.signal);
  const resolvedLocation = await abortable(client.geocode(request.query, context), context?.signal);
  return executeResolvedSearch({ center: resolvedLocation, resolvedLocation, categoryIds: request.categoryIds, radiusMeters: request.radiusMeters }, client, delay, undefined, context);
}

export async function executeResolvedSearch(request: ConfirmedSearchRequest, client: SearchClient, delay: Delay = realDelay, diagnostics?: Diagnostics, context?: RequestContext): Promise<SearchResponse> {
  const categories = request.categoryIds.map(getCategory);
  const results = await searchCategoriesSequentially(request.resolvedLocation, categories, client.searchNearby.bind(client), request.radiusMeters, delay, 500, diagnostics, context);
  if (results.length > 0 && results.every(result => result.status === "error")) throw new AmapApiError("All categories failed", null, null, "ALL_CATEGORIES_FAILED");
  diagnostics?.event("search.completed", "request", { outcome: results.some(result => result.status === "error") ? "partial success" : "success" });
  return { resolvedLocation: request.resolvedLocation, categories: results, status: results.some((result) => result.status === "error") ? "partial success" : "success" };
}

export async function executeSecondPageSearch(request: SearchSecondPageRequest, client: SearchClient, context?: RequestContext): Promise<SearchSecondPageResponse> {
  throwIfAborted(context?.signal);
  const category = getCategory(request.categoryId);
  const page = await abortable(client.searchNearby(request.center, category, { radiusMeters: request.radiusMeters, pageNumber: 2, pageSize: 25 }, context), context?.signal);
  throwIfAborted(context?.signal);
  return { categoryId: category.key, page };
}
