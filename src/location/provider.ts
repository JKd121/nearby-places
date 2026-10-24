import { AmapApiError, createAmapClientWithTransport } from "../amap/client.js";
import { createAmapTransport, type AmapTransport, type AmapTransportOptions } from "../amap/transport.js";
import type { RequestContext } from "../amap/request-context.js";
import { measureSync, type Diagnostics } from "../diagnostics.js";
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

async function requestPoiText(key: string, query: string, transport: AmapTransport, context?: RequestContext): Promise<UnknownRecord> {
  const params = new URLSearchParams({ key, keywords: query, page_size: String(PAGE_SIZE), page_num: "1", show_fields: "business" });
  return transport.requestJson(new URL(`${POI_TEXT_URL}?${params.toString()}`), "poi-text", context);
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

export function createLocationResolverProvider(key: string, fetchImpl?: typeof fetch, diagnostics?: Diagnostics, options: AmapTransportOptions = {}): LocationResolverProvider {
  return createLocationResolverProviderWithTransport(key, createAmapTransport(fetchImpl, { ...options, ...(diagnostics ? { diagnostics } : {}) }), diagnostics);
}

export function createLocationResolverProviderWithTransport(key: string, transport: AmapTransport, diagnostics?: Diagnostics): LocationResolverProvider {
  const amap = createAmapClientWithTransport(key, transport, diagnostics);
  return {
    async geocode(query, context) {
      try {
        return await amap.geocode(query, context);
      } catch (error) {
        if (error instanceof AmapApiError && error.code === "GEOCODE_NOT_FOUND") return null;
        throw error;
      }
    },
    async searchPlaceCandidates(query, context) {
      const payload = await requestPoiText(key, query, transport, context);
      return measureSync(diagnostics, "amap.transform", () => parsePoiCandidates(payload));
    },
  };
}
