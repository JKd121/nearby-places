import { measureAsync, measureSync, type Diagnostics } from "../diagnostics.js";
import { AmapApiError, createAmapClient } from "../amap/client.js";
import type { Coordinates } from "../amap/types.js";
import type { LocationResolverProvider, ProviderPlace } from "./types.js";

const POI_TEXT_URL = "https://restapi.amap.com/v5/place/text";
const PAGE_SIZE = 10;
type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function parseLocation(value: unknown): Coordinates | null {
  if (typeof value !== "string") return null;
  const [longitudeText, latitudeText] = value.split(",");
  if (!longitudeText || !latitudeText) return null;
  const longitude = Number(longitudeText);
  const latitude = Number(latitudeText);
  return Number.isFinite(longitude) && Number.isFinite(latitude) ? { longitude, latitude } : null;
}

async function requestPoiText(key: string, query: string, fetchImpl: typeof fetch, diagnostics?: Diagnostics): Promise<UnknownRecord> {
  const params = new URLSearchParams({ key, keywords: query, page_size: String(PAGE_SIZE), page_num: "1", show_fields: "business" });
  const response = await measureAsync(diagnostics, "amap.fetch", () => fetchImpl(new URL(`${POI_TEXT_URL}?${params.toString()}`)));
  const body = await measureAsync(diagnostics, "amap.read", () => response.text());
  if (!response.ok) return measureSync(diagnostics, "amap.validate", () => {
    const error = new AmapApiError(`POI text search failed with HTTP ${response.status}`, null, String(response.status));
    diagnostics?.annotate(error, "upstream_http", String(response.status));
    throw error;
  });
  let payload: unknown;
  payload = measureSync(diagnostics, "amap.json", () => {
    try { return JSON.parse(body); }
    catch {
      const error = new AmapApiError("POI text search returned invalid JSON");
      diagnostics?.annotate(error, "invalid_json");
      throw error;
    }
  });
  return measureSync(diagnostics, "amap.validate", () => {
    if (!isRecord(payload)) {
      const error = new AmapApiError("POI text search returned a non-object response");
      diagnostics?.annotate(error, "invalid_payload");
      throw error;
    }
    if (optionalString(payload.status) !== "1") {
      const info = optionalString(payload.info);
      const infocode = optionalString(payload.infocode);
      const error = new AmapApiError(`POI text search failed: ${info ?? "unknown provider error"}${infocode ? ` (${infocode})` : ""}`, info, infocode);
      diagnostics?.annotate(error, "upstream_business", infocode);
      throw error;
    }
    return payload;
  });
}

function parsePoiCandidates(payload: UnknownRecord): ProviderPlace[] {
  const pois = Array.isArray(payload.pois) ? payload.pois : [];
  return pois.flatMap((value, index): ProviderPlace[] => {
    if (!isRecord(value)) return [];
    return [{
      id: optionalString(value.id),
      name: optionalString(value.name),
      type: optionalString(value.type),
      typeCode: optionalString(value.typecode),
      province: optionalString(value.pname),
      city: optionalString(value.cityname),
      district: optionalString(value.adname),
      address: optionalString(value.address),
      location: parseLocation(value.location),
      providerRank: index + 1,
    }];
  });
}

export function createLocationResolverProvider(key: string, fetchImpl: typeof fetch = fetch, diagnostics?: Diagnostics): LocationResolverProvider {
  const amap = createAmapClient(key, fetchImpl, diagnostics);
  return {
    async geocode(query) {
      try {
        return await amap.geocode(query);
      } catch (error) {
        if (error instanceof AmapApiError && error.message.startsWith("No geocoding result found")) return null;
        throw error;
      }
    },
    async searchPlaceCandidates(query) {
      const payload = await requestPoiText(key, query, fetchImpl, diagnostics);
      return measureSync(diagnostics, "amap.transform", () => parsePoiCandidates(payload));
    },
  };
}
