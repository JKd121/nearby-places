import { isCategoryKey } from "../amap/categories.js";
import type { LocationCandidate } from "../location/types.js";
import type { HistorySearchInput } from "./contracts.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isConfirmedLocation(value: unknown): value is LocationCandidate {
  if (!isRecord(value) || !isRecord(value.location)) return false;
  const { longitude, latitude } = value.location;
  return typeof value.name === "string" && value.name.trim().length > 0 &&
    ["id", "placeType", "city", "district", "address"].every((field) =>
      value[field] === null || typeof value[field] === "string") &&
    typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 &&
    typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90;
}

export function isHistorySearchInput(value: unknown): value is HistorySearchInput {
  if (!isRecord(value)) return false;
  return typeof value.query === "string" && value.query.trim().length > 0 && value.query.trim().length <= 200 &&
    Array.isArray(value.categoryIds) && value.categoryIds.length > 0 &&
    value.categoryIds.every((id) => typeof id === "string" && isCategoryKey(id)) &&
    new Set(value.categoryIds).size === value.categoryIds.length &&
    typeof value.radiusMeters === "number" && [1000, 2000, 3000, 5000].includes(value.radiusMeters) &&
    isConfirmedLocation(value.confirmedLocation);
}

/** Keep only the confirmed provider fields; never infer missing address information. */
export function copyConfirmedLocation(value: LocationCandidate) {
  return {
    id: value.id, name: value.name, placeType: value.placeType,
    city: value.city, district: value.district, address: value.address,
    location: { longitude: value.location.longitude, latitude: value.location.latitude },
  } satisfies LocationCandidate;
}
