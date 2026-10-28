import { CATEGORIES, getCategory } from "../../../src/amap/categories.js";
import { AmapApiError } from "../../../src/amap/errors.js";
import type { CategoryKey, Coordinates } from "../../../src/amap/types.js";

export const MAX_CALLS = 9;
export const FIXED = { endpoint: "/v5/place/around", pageSize: 25, pageNumber: 1, sortRule: "distance", showFields: "business" } as const;
export type Mode = "dry" | "mock" | "live";
export interface Site extends Coordinates { density: "low" | "medium" | "high"; }
export interface Config { radiusMeters: number; locations: Site[]; }
export interface Trial { id: string; siteId: string; density: Site["density"]; group: "A" | "B" | "C"; categories: CategoryKey[]; }
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseConfig(value: unknown): Config {
  if (!record(value) || !Number.isInteger(value.radiusMeters) || Number(value.radiusMeters) < 1 || Number(value.radiusMeters) > 50000 || !Array.isArray(value.locations) || value.locations.length !== 3) throw new Error("Invalid experiment configuration");
  const locations = value.locations.map((site): Site => {
    if (!record(site) || !["low", "medium", "high"].includes(String(site.density)) || typeof site.longitude !== "number" || typeof site.latitude !== "number" || !Number.isFinite(site.longitude) || !Number.isFinite(site.latitude) || Math.abs(site.longitude) > 180 || Math.abs(site.latitude) > 90) throw new Error("Invalid experiment site");
    return { density: site.density as Site["density"], longitude: site.longitude, latitude: site.latitude };
  });
  if (new Set(locations.map(s => s.density)).size !== 3 || new Set(locations.map(s => `${s.longitude},${s.latitude}`)).size !== 3) throw new Error("Sites must be distinct with three density hypotheses");
  return { radiusMeters: Number(value.radiusMeters), locations };
}

/** Synthetic points only. Never used as a live fallback. */
export const SYNTHETIC_CONFIG: Config = { radiusMeters: 1000, locations: [
  { density: "low", longitude: 0, latitude: 0 }, { density: "medium", longitude: 1, latitude: 1 }, { density: "high", longitude: 2, latitude: 2 },
] };

export function plan(config: Config): Trial[] {
  parseConfig(config);
  const groups: [Trial["group"], CategoryKey[]][] = [
    ["A", ["hotel", "mall", "hotpot"]],
    ["B", ["hotel", "mall", "hotpot", "gym", "bus"]],
    ["C", CATEGORIES.map(c => c.key)],
  ];
  if (CATEGORIES.length !== 10 || groups.some(([, keys], i) => keys.length !== [3, 5, 10][i] || keys.some(k => !getCategory(k).types.length))) throw new Error("Category configuration changed; review plan");
  const trials = config.locations.flatMap((site, i) => groups.map(([group, categories]): Trial => ({ id: `poi-union-v1-site-${i + 1}-${group}`, siteId: `site-${i + 1}`, density: site.density, group, categories })));
  if (trials.length !== MAX_CALLS) throw new Error("Invalid global budget");
  return trials;
}

export function requested(categories: readonly CategoryKey[]) {
  return categories.map(key => { const c = getCategory(key); return { key, label: c.label, typecodes: [...c.types] }; });
}

export function buildUrl(key: string, site: Coordinates, radius: number, trial: Trial): URL {
  const url = new URL("https://restapi.amap.com/v5/place/around");
  url.search = new URLSearchParams({ key, location: `${site.longitude},${site.latitude}`, radius: String(radius), types: requested(trial.categories).flatMap(c => c.typecodes).join("|"), page_size: "25", page_num: "1", sortrule: FIXED.sortRule, show_fields: FIXED.showFields }).toString();
  return url;
}

export function statistics(payload: Record<string, unknown>) {
  if (!Array.isArray(payload.pois) || payload.pois.length > FIXED.pageSize) throw new AmapApiError("Invalid POI array", null, null, "UPSTREAM_INVALID_PAYLOAD");
  const perCategory = Object.fromEntries(CATEGORIES.map(c => [c.key, 0])) as Record<CategoryKey, number>;
  const rawTypecodes: Record<string, number> = {};
  const unconfirmedTypecodes: Record<string, number> = {};
  let invalidItems = 0;
  for (const poi of payload.pois) {
    if (!record(poi)) invalidItems++;
    const raw = record(poi) ? poi.typecode : undefined;
    // Arbitrary provider text could contain credentials/coordinates; only six-digit codes are public.
    const code = raw === undefined || raw === null || raw === "" ? "<missing>" : typeof raw === "string" && /^\d{6}$/.test(raw) ? raw : "<invalid>";
    rawTypecodes[code] = (rawTypecodes[code] ?? 0) + 1;
    const matches = CATEGORIES.filter(c => (c.acceptedTypecodes ?? c.types).includes(code));
    if (matches.length === 1) perCategory[matches[0]!.key]++;
    else unconfirmedTypecodes[code] = (unconfirmedTypecodes[code] ?? 0) + 1;
  }
  return { returnedPois: payload.pois.length, perCategory, rawTypecodes, unconfirmedTypecodes,
    unconfirmedCount: Object.values(unconfirmedTypecodes).reduce((a, b) => a + b, 0), invalidItems, reachedPageCap: payload.pois.length === FIXED.pageSize };
}
export type Statistics = ReturnType<typeof statistics>;
