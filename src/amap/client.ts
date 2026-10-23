import { measureAsync, measureSync, type Diagnostics } from "../diagnostics.js";
import { computeDistanceMeters } from "./distance.js";
import type { CategoryConfig, Coordinates, GeocodedPlace, NearbySearchOptions, Place, PlacePage, SearchStrategy } from "./types.js";

const GEOCODE_URL = "https://restapi.amap.com/v3/geocode/geo";
const NEARBY_URL = "https://restapi.amap.com/v5/place/around";
type UnknownRecord = Record<string, unknown>;

export class AmapApiError extends Error {
  constructor(message: string, readonly info: string | null = null, readonly infocode: string | null = null) {
    super(message);
    this.name = "AmapApiError";
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
function requiredString(value: unknown, fallback = ""): string { return optionalString(value) ?? fallback; }
function optionalNumber(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function parseLocation(value: unknown): Coordinates | null {
  if (typeof value !== "string") return null;
  const [longitudeText, latitudeText] = value.split(",");
  if (longitudeText === undefined || latitudeText === undefined) return null;
  const longitude = Number(longitudeText);
  const latitude = Number(latitudeText);
  return Number.isFinite(longitude) && Number.isFinite(latitude) ? { longitude, latitude } : null;
}
function assertAmapSuccess(payload: unknown, operation: string): UnknownRecord {
  if (!isRecord(payload)) throw new AmapApiError(`${operation}: response was not a JSON object`);
  if (optionalString(payload.status) !== "1") {
    const info = optionalString(payload.info);
    const infocode = optionalString(payload.infocode);
    throw new AmapApiError(`${operation}: ${info ?? "unknown AMap error"}${infocode ? ` (${infocode})` : ""}`, info, infocode);
  }
  return payload;
}
async function requestJson(url: URL, operation: string, fetchImpl: typeof fetch, diagnostics?: Diagnostics): Promise<UnknownRecord> {
  const response = await measureAsync(diagnostics, "amap.fetch", () => fetchImpl(url));
  const body = await measureAsync(diagnostics, "amap.read", () => response.text());
  if (!response.ok) return measureSync(diagnostics, "amap.validate", () => {
    const error = new AmapApiError(`${operation}: HTTP ${response.status} ${response.statusText}; ${body}`);
    diagnostics?.annotate(error, "upstream_http", String(response.status));
    throw error;
  });
  let payload: unknown;
  payload = measureSync(diagnostics, "amap.json", () => {
    try { return JSON.parse(body); }
    catch {
      const error = new AmapApiError(`${operation}: response was not valid JSON; ${body}`);
      diagnostics?.annotate(error, "invalid_json");
      throw error;
    }
  });
  return measureSync(diagnostics, "amap.validate", () => {
    try { return assertAmapSuccess(payload, operation); }
    catch (error) {
      diagnostics?.annotate(error, isRecord(payload) ? "upstream_business" : "invalid_payload", error instanceof AmapApiError ? error.infocode : null);
      throw error;
    }
  });
}
function validateOptions(options: NearbySearchOptions): void {
  if (!Number.isInteger(options.pageNumber) || options.pageNumber < 1) throw new RangeError("pageNumber must be an integer >= 1");
  if (!Number.isInteger(options.pageSize) || options.pageSize < 1 || options.pageSize > 25) throw new RangeError("pageSize must be an integer from 1 to 25");
  if (!Number.isFinite(options.radiusMeters) || options.radiusMeters <= 0) throw new RangeError("radiusMeters must be greater than 0");
}
function applySearchStrategy(params: URLSearchParams, category: CategoryConfig, strategy: SearchStrategy): void {
  if (strategy === "keyword-only" || strategy === "keyword-and-types") params.set("keywords", category.keyword);
  if (strategy === "types-only" || strategy === "keyword-and-types") params.set("types", category.types.join("|"));
}

export function createAmapClient(key: string, fetchImpl: typeof fetch = fetch, diagnostics?: Diagnostics) {
  if (key.trim() === "") throw new Error("Missing AMAP_WEB_SERVICE_KEY. Set it in the process environment before running the smoke test.");
  return {
    async geocode(query: string): Promise<GeocodedPlace> {
      const url = new URL(GEOCODE_URL);
      url.search = new URLSearchParams({ key, address: query, output: "JSON" }).toString();
      const payload = await requestJson(url, `Geocoding '${query}' failed`, fetchImpl, diagnostics);
      const first = (Array.isArray(payload.geocodes) ? payload.geocodes : [])[0];
      if (!isRecord(first)) throw new AmapApiError(`No geocoding result found for '${query}'.`);
      const location = parseLocation(first.location);
      if (!location) throw new AmapApiError(`Geocoding result for '${query}' did not contain a valid location.`);
      return { query, formattedAddress: requiredString(first.formatted_address), province: optionalString(first.province), city: optionalString(first.city), district: optionalString(first.district), level: optionalString(first.level), ...location };
    },
    async searchNearby(centre: Coordinates, category: CategoryConfig, options: NearbySearchOptions): Promise<PlacePage> {
      validateOptions(options);
      const strategy = options.strategy ?? category.strategy;
      const params = new URLSearchParams({ key, location: `${centre.longitude},${centre.latitude}`, radius: String(options.radiusMeters), sortrule: "distance", show_fields: "business", page_size: String(options.pageSize), page_num: String(options.pageNumber) });
      applySearchStrategy(params, category, strategy);
      const url = new URL(NEARBY_URL);
      url.search = params.toString();
      const payload = await requestJson(url, `Nearby search '${category.label}' failed`, fetchImpl, diagnostics);
      const rawPois = Array.isArray(payload.pois) ? payload.pois : [];
      const places = measureSync(diagnostics, "amap.transform", () => rawPois.flatMap((candidate): Place[] => {
        if (!isRecord(candidate)) return [];
        const typecode = optionalString(candidate.typecode);
        if (category.acceptedTypecodes && (typecode === null || !category.acceptedTypecodes.includes(typecode))) return [];
        const location = parseLocation(candidate.location);
        if (!location) return [];
        const business = isRecord(candidate.business) ? candidate.business : {};
        const computedDistanceMeters = computeDistanceMeters(centre, location);
        const nativeDistance = optionalNumber(candidate.distance);
        const amapDistanceMeters = nativeDistance !== null && nativeDistance >= 0 ? nativeDistance : null;
        return [{ id: requiredString(candidate.id), parentId: optionalString(candidate.parent), name: requiredString(candidate.name, "(unnamed POI)"), category: category.key, distanceMeters: amapDistanceMeters ?? computedDistanceMeters, distanceSource: amapDistanceMeters === null ? "computed" : "amap", amapDistanceMeters, computedDistanceMeters, type: optionalString(candidate.type), typecode, cost: optionalNumber(business.cost), rating: optionalNumber(business.rating), tag: optionalString(business.tag), openTimeToday: optionalString(business.opentime_today), openTimeWeek: optionalString(business.opentime_week), address: requiredString(candidate.address), ...location }];
      }).sort((left, right) => left.distanceMeters - right.distanceMeters), { category: category.key });
      // `count` is an API total-count hint, not the number returned on this page.
      // Keep this contract page-local so it cannot be mistaken for a total page count.
      return { places, pageNumber: options.pageNumber, pageSize: options.pageSize, returnedCount: rawPois.length, mayHaveNextApiPage: rawPois.length === options.pageSize };
    }
  };
}
