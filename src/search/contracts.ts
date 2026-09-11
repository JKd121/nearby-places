import type { CategoryKey, CategorySearchResult, Coordinates, GeocodedPlace } from "../amap/types.js";

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
}
