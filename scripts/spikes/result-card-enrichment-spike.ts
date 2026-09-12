import { CATEGORIES } from "../../src/amap/categories.js";

const GEOCODE_URL = "https://restapi.amap.com/v3/geocode/geo";
const AROUND_URL = "https://restapi.amap.com/v5/place/around";
const INTERVAL_MS = 500;
const PAGE_SIZE = 25;

type RecordLike = Record<string, unknown>;
type Sample = { id: "shenzhen" | "hong-kong"; query: string; location: { longitude: number; latitude: number } | null };

function isRecord(value: unknown): value is RecordLike { return typeof value === "object" && value !== null && !Array.isArray(value); }
function stringValue(value: unknown): string | null { return typeof value === "string" && value.trim() !== "" ? value : null; }
function parseLocation(value: unknown): { longitude: number; latitude: number } | null {
  if (typeof value !== "string") return null;
  const [longitudeText, latitudeText] = value.split(",");
  if (longitudeText === undefined || latitudeText === undefined) return null;
  const longitude = Number(longitudeText);
  const latitude = Number(latitudeText);
  return Number.isFinite(longitude) && Number.isFinite(latitude) ? { longitude, latitude } : null;
}
function parsePhotos(value: unknown): Array<{ title: string | null; url: string | null }> {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((photo) => ({ title: stringValue(photo.title), url: stringValue(photo.url) }));
}
function safeError(payload: unknown): { info: string | null; infocode: string | null } {
  if (!isRecord(payload)) return { info: null, infocode: null };
  return { info: stringValue(payload.info), infocode: stringValue(payload.infocode) };
}
function protocolOf(url: string | null): "https" | "http" | "other" | null {
  if (!url) return null;
  try { const protocol = new URL(url).protocol; return protocol === "https:" ? "https" : protocol === "http:" ? "http" : "other"; } catch { return "other"; }
}
async function getJson(url: URL): Promise<RecordLike> {
  const response = await fetch(url);
  const payload: unknown = await response.json();
  if (!response.ok || !isRecord(payload) || payload.status !== "1") {
    const error = safeError(payload);
    throw new Error(`provider request failed: ${error.info ?? `HTTP ${response.status}`} (${error.infocode ?? "no-infocode"})`);
  }
  return payload;
}
async function geocode(key: string, query: string): Promise<Sample["location"]> {
  const url = new URL(GEOCODE_URL);
  url.search = new URLSearchParams({ key, address: query, output: "JSON" }).toString();
  const payload = await getJson(url);
  const first = Array.isArray(payload.geocodes) && isRecord(payload.geocodes[0]) ? payload.geocodes[0] : null;
  return first ? parseLocation(first.location) : null;
}
async function around(key: string, sample: Sample, category: typeof CATEGORIES[number]): Promise<void> {
  if (!sample.location) { console.log(`${sample.id} ${category.key}: skipped (no geocode location)`); return; }
  const params = new URLSearchParams({ key, location: `${sample.location.longitude},${sample.location.latitude}`, radius: "3000", sortrule: "distance", show_fields: "business,navi,photos", page_size: String(PAGE_SIZE), page_num: "1", types: category.types.join("|") });
  const url = new URL(AROUND_URL);
  url.search = params.toString();
  try {
    const payload = await getJson(url);
    const pois = Array.isArray(payload.pois) ? payload.pois.filter(isRecord) : [];
    const rows = pois.map((poi) => {
      const photos = parsePhotos(poi.photos);
      const usable = photos.find((photo) => photo.url !== null);
      return { name: stringValue(poi.name) ?? "(unnamed)", type: stringValue(poi.type), typecode: stringValue(poi.typecode), photoCount: photos.length, firstPhotoProtocol: protocolOf(usable?.url ?? null), hasHttpsPhoto: photos.some((photo) => protocolOf(photo.url) === "https"), photoUrlsUsableDirectly: Boolean(usable?.url) };
    });
    console.log(JSON.stringify({ sample: sample.id, category: category.key, requestedTypes: category.types, returned: rows.length, withPhotos: rows.filter((row) => row.photoCount > 0).length, rows }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({ sample: sample.id, category: category.key, requestedTypes: category.types, status: "error", message: error instanceof Error ? error.message : String(error) }));
  }
}
async function delay(): Promise<void> { await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS)); }

async function main(): Promise<void> {
  const key = process.env.AMAP_WEB_SERVICE_KEY;
  if (!key?.trim()) { console.error("AMAP_WEB_SERVICE_KEY is absent; photo enrichment Spike stopped before any AMap request."); process.exitCode = 2; return; }
  const samples: Sample[] = [
    { id: "shenzhen", query: "深圳北站", location: await geocode(key, "深圳北站") },
    { id: "hong-kong", query: "香港特别行政区九龙达之路香港城市大学", location: await geocode(key, "香港特别行政区九龙达之路香港城市大学") }
  ];
  for (const sample of samples) {
    for (const [index, category] of CATEGORIES.entries()) {
      await around(key, sample, category);
      if (index < CATEGORIES.length - 1) await delay();
    }
  }
}

await main();
