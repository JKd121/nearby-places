import { measureAsync, type Diagnostics } from "../diagnostics.js";
import { AmapApiError } from "../amap/client.js";
import { getCategory } from "../amap/categories.js";
import type { CategoryConfig, CategorySearchResult, Coordinates, GeocodedPlace, NearbySearchOptions, PlacePage, SearchFailure } from "../amap/types.js";
import type { ConfirmedSearchRequest, SearchRequest, SearchResponse, SearchSecondPageRequest, SearchSecondPageResponse } from "./contracts.js";
import { deriveCategoryStatus } from "./status.js";

export type Delay = (milliseconds: number) => Promise<void>;

export interface SearchClient {
  geocode(query: string): Promise<GeocodedPlace>;
  searchNearby(centre: Coordinates, category: CategoryConfig, options: NearbySearchOptions): Promise<PlacePage>;
}

const realDelay: Delay = async (milliseconds) => { await new Promise<void>((resolve) => setTimeout(resolve, milliseconds)); };

function toFailure(error: unknown): SearchFailure {
  return {
    message: error instanceof Error ? error.message : String(error),
    info: error instanceof AmapApiError ? error.info : null,
    infocode: error instanceof AmapApiError ? error.infocode : null
  };
}

export async function searchCategoriesSequentially(
  centre: GeocodedPlace,
  categories: readonly CategoryConfig[],
  searchNearby: SearchClient["searchNearby"],
  radiusMeters: number,
  delay: Delay = realDelay,
  intervalMilliseconds = 500,
  diagnostics?: Diagnostics
): Promise<CategorySearchResult[]> {
  const results: CategorySearchResult[] = [];
  for (const [index, category] of categories.entries()) {
    try {
      const response = await measureAsync(diagnostics, "search.category", () => searchNearby(centre, category, { radiusMeters, pageNumber: 1, pageSize: 25 }), { category: category.key });
      const { places, ...page } = response;
      results.push({ category, status: deriveCategoryStatus(places, page), places, page, error: null });
    } catch (error) {
      diagnostics?.error(error, "search.category", true, { category: category.key });
      results.push({ category, status: "error", places: [], page: null, error: toFailure(error) });
    }
    diagnostics?.event("search.category.completed", "search.category", { category: category.key, outcome: results[results.length - 1]!.status });
    if (index < categories.length - 1) await measureAsync(diagnostics, "search.inter_category_wait", () => delay(intervalMilliseconds), { scheduledMs: intervalMilliseconds });
  }
  return results;
}

export async function executeSearch(request: SearchRequest, client: SearchClient, delay: Delay = realDelay): Promise<SearchResponse> {
  const resolvedLocation = await client.geocode(request.query);
  return executeResolvedSearch({ center: resolvedLocation, resolvedLocation, categoryIds: request.categoryIds, radiusMeters: request.radiusMeters }, client, delay);
}

export async function executeResolvedSearch(request: ConfirmedSearchRequest, client: SearchClient, delay: Delay = realDelay, diagnostics?: Diagnostics): Promise<SearchResponse> {
  const categories = request.categoryIds.map(getCategory);
  const results = await searchCategoriesSequentially(request.resolvedLocation, categories, client.searchNearby.bind(client), request.radiusMeters, delay, 500, diagnostics);
  diagnostics?.event("search.completed", "request", { outcome: results.some((result) => result.status === "error") ? "partial success" : "success" });
  return { resolvedLocation: request.resolvedLocation, categories: results, status: results.some((result) => result.status === "error") ? "partial success" : "success" };
}

export async function executeSecondPageSearch(request: SearchSecondPageRequest, client: SearchClient): Promise<SearchSecondPageResponse> {
  const category = getCategory(request.categoryId);
  const page = await client.searchNearby(request.center, category, { radiusMeters: request.radiusMeters, pageNumber: 2, pageSize: 25 });
  return { categoryId: category.key, page };
}
