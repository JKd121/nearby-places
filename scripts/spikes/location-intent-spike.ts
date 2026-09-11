import { AmapApiError, createAmapClient } from "../../src/amap/client.js";
import type { Coordinates, GeocodedPlace } from "../../src/amap/types.js";

const POI_TEXT_URL = "https://restapi.amap.com/v5/place/text";
const INTERVAL_MS = 500;
const PAGE_SIZE = 10;

type UnknownRecord = Record<string, unknown>;
type Strategy = "geocode-baseline" | "poi-candidate" | "poi-candidate-decomposition";

interface SpikeQuery {
  id: "A" | "B" | "C" | "D" | "E" | "E1" | "E2";
  rawQuery: string;
  structuredAddress: boolean;
  experimentalInterpretation: string | null;
}

interface SpikeCandidate {
  id: string | null;
  name: string;
  placeType: string | null;
  typeCode: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  location: Coordinates | null;
  parentId: string | null;
  childrenCount: number | null;
  source: "geocode" | "poi";
  providerRank: number;
}

interface SpikeResult {
  queryId: SpikeQuery["id"];
  rawQuery: string;
  strategy: Strategy;
  experimentalInterpretation: string | null;
  request: { endpoint: "geocode" | "poi-text"; keywords: string | null; cityConstraint: string | null };
  status: "success" | "empty" | "error";
  info: string | null;
  infocode: string | null;
  candidates: SpikeCandidate[];
}

class SpikeProviderError extends Error {
  constructor(message: string, readonly info: string | null = null, readonly infocode: string | null = null) {
    super(message);
    this.name = "SpikeProviderError";
  }
}

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

function providerError(error: unknown): Pick<SpikeResult, "info" | "infocode"> & { message: string } {
  if (error instanceof AmapApiError || error instanceof SpikeProviderError) {
    return { message: error.message, info: error.info, infocode: error.infocode };
  }
  return { message: error instanceof Error ? error.message : String(error), info: null, infocode: null };
}

async function requestPoiText(key: string, keywords: string, cityConstraint: string | null): Promise<UnknownRecord> {
  const params = new URLSearchParams({ key, keywords, page_size: String(PAGE_SIZE), page_num: "1", show_fields: "business" });
  if (cityConstraint) params.set("city", cityConstraint);
  const response = await fetch(`${POI_TEXT_URL}?${params.toString()}`);
  const body = await response.text();
  if (!response.ok) throw new SpikeProviderError(`POI text '${keywords}' failed with HTTP ${response.status}`, null, String(response.status));
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new SpikeProviderError(`POI text '${keywords}' returned invalid JSON`);
  }
  if (!isRecord(payload)) throw new SpikeProviderError(`POI text '${keywords}' returned a non-object response`);
  if (optionalString(payload.status) !== "1") {
    throw new SpikeProviderError(`POI text '${keywords}' failed: ${optionalString(payload.info) ?? "unknown provider error"}`, optionalString(payload.info), optionalString(payload.infocode));
  }
  return payload;
}

function parsePoiCandidates(payload: UnknownRecord): SpikeCandidate[] {
  const rawPois = Array.isArray(payload.pois) ? payload.pois : [];
  return rawPois.flatMap((raw, index): SpikeCandidate[] => {
    if (!isRecord(raw)) return [];
    const location = parseLocation(raw.location);
    if (!location) return [];
    const parent = isRecord(raw.parent) ? raw.parent : null;
    const childrenCount = Array.isArray(raw.children) ? raw.children.length : null;
    return [{
      id: optionalString(raw.id),
      name: optionalString(raw.name) ?? "(unnamed POI)",
      placeType: optionalString(raw.type),
      typeCode: optionalString(raw.typecode),
      province: optionalString(raw.pname),
      city: optionalString(raw.cityname),
      district: optionalString(raw.adname),
      address: optionalString(raw.address),
      location,
      parentId: parent ? optionalString(parent.id) : null,
      childrenCount,
      source: "poi",
      providerRank: index + 1
    }];
  });
}

function geocodeCandidate(place: GeocodedPlace): SpikeCandidate {
  return {
    id: null,
    name: place.formattedAddress || "(unnamed geocode result)",
    placeType: place.level,
    typeCode: null,
    province: place.province,
    city: place.city,
    district: place.district,
    address: place.formattedAddress || null,
    location: { longitude: place.longitude, latitude: place.latitude },
    parentId: null,
    childrenCount: null,
    source: "geocode",
    providerRank: 1
  };
}

function emptyResult(query: SpikeQuery, strategy: Strategy, request: SpikeResult["request"], candidates: SpikeCandidate[] = []): SpikeResult {
  return { queryId: query.id, rawQuery: query.rawQuery, strategy, experimentalInterpretation: query.experimentalInterpretation, request, status: candidates.length === 0 ? "empty" : "success", info: null, infocode: null, candidates };
}

async function runQuery(query: SpikeQuery, client: ReturnType<typeof createAmapClient>): Promise<SpikeResult[]> {
  const results: SpikeResult[] = [];
  try {
    const geocoded = await client.geocode(query.rawQuery);
    results.push(emptyResult(query, "geocode-baseline", { endpoint: "geocode", keywords: null, cityConstraint: null }, [geocodeCandidate(geocoded)]));
  } catch (error) {
    const failure = providerError(error);
    results.push({ queryId: query.id, rawQuery: query.rawQuery, strategy: "geocode-baseline", experimentalInterpretation: query.experimentalInterpretation, request: { endpoint: "geocode", keywords: null, cityConstraint: null }, status: "error", info: failure.info, infocode: failure.infocode, candidates: [] });
  }
  await delay(INTERVAL_MS);

  try {
    const payload = await requestPoiText(process.env.AMAP_WEB_SERVICE_KEY!, query.rawQuery, null);
    results.push(emptyResult(query, "poi-candidate", { endpoint: "poi-text", keywords: query.rawQuery, cityConstraint: null }, parsePoiCandidates(payload)));
  } catch (error) {
    const failure = providerError(error);
    results.push({ queryId: query.id, rawQuery: query.rawQuery, strategy: "poi-candidate", experimentalInterpretation: query.experimentalInterpretation, request: { endpoint: "poi-text", keywords: query.rawQuery, cityConstraint: null }, status: "error", info: failure.info, infocode: failure.infocode, candidates: [] });
  }

  if (query.id === "C") {
    await delay(INTERVAL_MS);
    const keywords = "澜庭酒店";
    const cityConstraint = "深圳";
    try {
      const payload = await requestPoiText(process.env.AMAP_WEB_SERVICE_KEY!, keywords, cityConstraint);
      results.push(emptyResult(query, "poi-candidate-decomposition", { endpoint: "poi-text", keywords, cityConstraint }, parsePoiCandidates(payload)));
    } catch (error) {
      const failure = providerError(error);
      results.push({ queryId: query.id, rawQuery: query.rawQuery, strategy: "poi-candidate-decomposition", experimentalInterpretation: query.experimentalInterpretation, request: { endpoint: "poi-text", keywords, cityConstraint }, status: "error", info: failure.info, infocode: failure.infocode, candidates: [] });
    }
  }
  return results;
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

const queries: readonly SpikeQuery[] = [
  { id: "A", rawQuery: "深圳北站", structuredAddress: false, experimentalInterpretation: null },
  { id: "B", rawQuery: "香港城市大学", structuredAddress: false, experimentalInterpretation: null },
  { id: "C", rawQuery: "澜庭酒店 深圳罗湖", structuredAddress: false, experimentalInterpretation: "entity=澜庭酒店; city=深圳; district=罗湖; type=酒店 (manual experiment only)" },
  { id: "D", rawQuery: "维也纳酒店", structuredAddress: false, experimentalInterpretation: null },
  { id: "E", rawQuery: "广东省深圳市龙华区深圳北站", structuredAddress: true, experimentalInterpretation: null },
  { id: "E1", rawQuery: "深圳市龙华区民治街道北站社区致远中路28号", structuredAddress: true, experimentalInterpretation: null },
  { id: "E2", rawQuery: "香港特别行政区九龙塘达之路83号", structuredAddress: true, experimentalInterpretation: null }
];

async function main(): Promise<void> {
  const key = process.env.AMAP_WEB_SERVICE_KEY;
  if (!key?.trim()) {
    console.error("AMAP_WEB_SERVICE_KEY is absent; real resolver Spike stopped before any AMap request.");
    process.exitCode = 2;
    return;
  }

  const client = createAmapClient(key);
  const addressMicroOnly = process.argv.includes("--address-micro");
  const selectedQueries = addressMicroOnly ? queries.filter((query) => query.id === "E1" || query.id === "E2") : queries;
  const results: SpikeResult[] = [];
  for (const [index, query] of selectedQueries.entries()) {
    const queryResults = await runQuery(query, client);
    results.push(...queryResults);
    if (index < selectedQueries.length - 1) await delay(INTERVAL_MS);
  }

  console.log(JSON.stringify({
    spike: "v0.2A-location-intent-resolution",
    mode: addressMicroOnly ? "address-micro" : "full",
    requestDiscipline: { sequential: true, intervalMilliseconds: INTERVAL_MS, pageSize: PAGE_SIZE, rawResponsesDumped: false },
    queries: selectedQueries,
    results
  }, null, 2));
}

await main();
