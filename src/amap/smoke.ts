import { searchCategoriesSequentially } from "../search/service.js";
import type { Delay } from "../search/service.js";
import type { CategoryConfig, CategorySearchResult, Coordinates, GeocodedPlace, NearbySearchOptions, PlacePage } from "./types.js";

export type NearbySearch = (centre: Coordinates, category: CategoryConfig, options: NearbySearchOptions) => Promise<PlacePage>;

export interface SmokeSearchOutcome { validationError: string | null; results: CategorySearchResult[]; }

export function validateGeocodeForSmoke(geocode: GeocodedPlace): string | null {
  if (!geocode.query.includes("香港")) return null;
  const administrativeFields = [geocode.province, geocode.city].filter((value): value is string => value !== null);
  const matchesHongKong = administrativeFields.length > 0
    ? administrativeFields.some((value) => value.includes("香港"))
    : geocode.formattedAddress.includes("香港");
  if (matchesHongKong) return null;
  return [
    "input contains '香港' but AMap matched a non-Hong Kong result",
    `address=${geocode.formattedAddress || "null"}`,
    `province=${geocode.province ?? "null"}`,
    `city=${geocode.city ?? "null"}`,
    `district=${geocode.district ?? "null"}`,
    `location=${geocode.longitude},${geocode.latitude}`,
    `level=${geocode.level ?? "null"}`
  ].join("; ");
}

export async function searchCategoriesForSmoke(
  geocode: GeocodedPlace,
  categories: readonly CategoryConfig[],
  searchNearby: NearbySearch,
  radiusMeters: number,
  delay?: Delay,
  intervalMilliseconds = 500
): Promise<SmokeSearchOutcome> {
  const validationError = validateGeocodeForSmoke(geocode);
  if (validationError) return { validationError, results: [] };
  const results = await searchCategoriesSequentially(geocode, categories, searchNearby, radiusMeters, delay, intervalMilliseconds);
  return { validationError: null, results };
}
