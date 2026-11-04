import type { CategoryKey, CategorySearchResult, Coordinates, GeocodedPlace, PlacePage } from "../amap/types.js";
import type { PublicSearchErrorCode } from "../errors/classify.js";

export type SearchRadius = 1_000 | 2_000 | 3_000 | 5_000;

export interface SearchRequest {
  query: string;
  categoryIds: CategoryKey[];
  radiusMeters: SearchRadius;
}

export interface ConfirmedSearchRequest {
  center: Coordinates;
  resolvedLocation: GeocodedPlace;
  categoryIds: CategoryKey[];
  radiusMeters: SearchRadius;
}

export interface SearchResponse {
  resolvedLocation: GeocodedPlace;
  categories: CategorySearchResult[];
  status: "success" | "partial success";
  termination?: { code: PublicSearchErrorCode; categoryId: CategoryKey };
}

/** Public progress state; waiting/running categories have no fabricated result. */
export interface SearchProgress {
  results: readonly CategorySearchResult[];
  active: readonly CategoryKey[];
  pending: readonly CategoryKey[];
  termination?: NonNullable<SearchResponse["termination"]>;
}

export type SearchStreamEvent =
  | { type: "progress"; progress: SearchProgress }
  | { type: "complete"; response: SearchResponse }
  | { type: "error"; error: { message: string; code?: string } };

export interface SearchSecondPageRequest {
  center: Coordinates;
  categoryId: CategoryKey;
  radiusMeters: SearchRadius;
}

export interface SearchSecondPageResponse {
  categoryId: CategoryKey;
  page: PlacePage;
}
