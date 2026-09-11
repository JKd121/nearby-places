import { isCategoryKey } from "../amap/categories.js";
import type { CategoryKey, Coordinates, GeocodedPlace } from "../amap/types.js";
import type { ConfirmedSearchRequest, SearchRadius, SearchRequest } from "./contracts.js";

const ALLOWED_FIELDS = new Set(["query", "categoryIds", "radiusMeters"]);
const ALLOWED_RADII = new Set<SearchRadius>([1_000, 2_000, 3_000, 5_000]);

export class SearchRequestValidationError extends Error {
  constructor(message: string) { super(message); this.name = "SearchRequestValidationError"; }
}

export function parseSearchRequest(input: unknown): SearchRequest {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new SearchRequestValidationError("request must be an object");
  const record = input as Record<string, unknown>;
  const extraFields = Object.keys(record).filter((key) => !ALLOWED_FIELDS.has(key));
  if (extraFields.length > 0) throw new SearchRequestValidationError(`unsupported request field(s): ${extraFields.join(", ")}`);

  if (typeof record.query !== "string") throw new SearchRequestValidationError("query must be a string");
  const query = record.query.trim();
  if (query.length < 1 || query.length > 200) throw new SearchRequestValidationError("query must contain 1 to 200 characters after trimming");

  if (!Array.isArray(record.categoryIds) || record.categoryIds.length === 0) throw new SearchRequestValidationError("categoryIds must be a non-empty array");
  const categoryIds: CategoryKey[] = [];
  const seen = new Set<string>();
  for (const value of record.categoryIds) {
    if (typeof value !== "string" || !isCategoryKey(value)) throw new SearchRequestValidationError(`unknown categoryId: ${String(value)}`);
    if (seen.has(value)) throw new SearchRequestValidationError(`duplicate categoryId: ${value}`);
    seen.add(value);
    categoryIds.push(value);
  }

  if (typeof record.radiusMeters !== "number" || !ALLOWED_RADII.has(record.radiusMeters as SearchRadius)) throw new SearchRequestValidationError("radiusMeters must be one of 1000, 2000, 3000, 5000");
  return { query, categoryIds, radiusMeters: record.radiusMeters as SearchRadius };
}

function parseCoordinates(value: unknown, fieldName: string): Coordinates {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new SearchRequestValidationError(`${fieldName} must be an object`);
  const record = value as Record<string, unknown>;
  if (typeof record.longitude !== "number" || !Number.isFinite(record.longitude) || record.longitude < -180 || record.longitude > 180) throw new SearchRequestValidationError(`${fieldName}.longitude must be between -180 and 180`);
  if (typeof record.latitude !== "number" || !Number.isFinite(record.latitude) || record.latitude < -90 || record.latitude > 90) throw new SearchRequestValidationError(`${fieldName}.latitude must be between -90 and 90`);
  return { longitude: record.longitude, latitude: record.latitude };
}

function parseNullableString(record: Record<string, unknown>, fieldName: string): string | null {
  const value = record[fieldName];
  if (value !== null && typeof value !== "string") throw new SearchRequestValidationError(`resolvedLocation.${fieldName} must be a string or null`);
  return value as string | null;
}

function parseResolvedLocation(value: unknown): GeocodedPlace {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new SearchRequestValidationError("resolvedLocation must be an object");
  const record = value as Record<string, unknown>;
  const coordinates = parseCoordinates(record, "resolvedLocation");
  if (typeof record.query !== "string" || record.query.trim() === "") throw new SearchRequestValidationError("resolvedLocation.query must be a non-empty string");
  if (typeof record.formattedAddress !== "string") throw new SearchRequestValidationError("resolvedLocation.formattedAddress must be a string");
  return { query: record.query, formattedAddress: record.formattedAddress, province: parseNullableString(record, "province"), city: parseNullableString(record, "city"), district: parseNullableString(record, "district"), level: parseNullableString(record, "level"), ...coordinates };
}

export function parseConfirmedSearchRequest(input: unknown): ConfirmedSearchRequest {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new SearchRequestValidationError("request must be an object");
  const record = input as Record<string, unknown>;
  const allowed = new Set(["center", "resolvedLocation", "categoryIds", "radiusMeters"]);
  const extraFields = Object.keys(record).filter((key) => !allowed.has(key));
  if (extraFields.length > 0) throw new SearchRequestValidationError(`unsupported request field(s): ${extraFields.join(", ")}`);
  const center = parseCoordinates(record.center, "center");
  const resolvedLocation = parseResolvedLocation(record.resolvedLocation);
  if (center.longitude !== resolvedLocation.longitude || center.latitude !== resolvedLocation.latitude) throw new SearchRequestValidationError("center must match resolvedLocation coordinates");
  const base = parseSearchRequest({ query: resolvedLocation.query, categoryIds: record.categoryIds, radiusMeters: record.radiusMeters });
  return { center, resolvedLocation, categoryIds: base.categoryIds, radiusMeters: base.radiusMeters };
}
