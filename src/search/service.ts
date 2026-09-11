import { AmapApiError } from "../amap/client.js";
import { getCategory } from "../amap/categories.js";
import type { CategoryConfig, CategorySearchResult, Coordinates, GeocodedPlace, NearbySearchOptions, PlacePage, SearchFailure } from "../amap/types.js";
import type { ConfirmedSearchRequest, SearchRequest, SearchResponse } from "./contracts.js";

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
  intervalMilliseconds = 500
): Promise<CategorySearchResult[]> {
  const results: CategorySearchResult[] = [];
  for (const [index, category] of categories.entries()) {
    try {
      const response = await searchNearby(centre, category, { radiusMeters, pageNumber: 1, pageSize: 25 });
      const { places, ...page } = response;
      results.push({ category, status: places.length === 0 ? "empty" : "success", places, page, error: null });
    } catch (error) {
      results.push({ category, status: "error", places: [], page: null, error: toFailure(error) });
    }
    if (index < categories.length - 1) await delay(intervalMilliseconds);
  }
  return results;
}

export async function executeSearch(request: SearchRequest, client: SearchClient, delay: Delay = realDelay): Promise<SearchResponse> {
  const resolvedLocation = await client.geocode(request.query);
  return executeResolvedSearch({ center: resolvedLocation, resolvedLocation, categoryIds: request.categoryIds, radiusMeters: request.radiusMeters }, client, delay);
}

export async function executeResolvedSearch(request: ConfirmedSearchRequest, client: SearchClient, delay: Delay = realDelay): Promise<SearchResponse> {
  const categories = request.categoryIds.map(getCategory);
  const results = await searchCategoriesSequentially(request.resolvedLocation, categories, client.searchNearby.bind(client), request.radiusMeters, delay);
  return { resolvedLocation: request.resolvedLocation, categories: results, status: results.some((result) => result.status === "error") ? "partial success" : "success" };
}
