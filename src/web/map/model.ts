import type { CategoryKey, CategorySearchResult, Place } from "../../amap/types.js";

export const MAP_METRICS = {
  desktopGrid: 64, mobileGrid: 80, viewportBuffer: 80, updateMs: 100,
  singleSize: 28, clusterSizes: [32, 38, 44], memberPageSize: 20,
  glowMs: 600, maxGlows: 12, fps: 30, maxPixelRatio: 2, maxZoom: 20,
} as const;

export const CATEGORY_APPEARANCE: Record<CategoryKey, { color: string; symbol: string }> = {
  hotel: { color: "#ff9cc4", symbol: "宿" }, mall: { color: "#ffe08b", symbol: "购" },
  hotpot: { color: "#86e4b8", symbol: "锅" }, bakery: { color: "#ffe08b", symbol: "包" },
  dessert: { color: "#e3c6ff", symbol: "甜" }, ktv: { color: "#e3c6ff", symbol: "K" },
  billiards: { color: "#86e4b8", symbol: "球" }, gym: { color: "#c8b7ff", symbol: "健" },
  bus: { color: "#c8b7ff", symbol: "公" }, subway: { color: "#86e4b8", symbol: "铁" },
};

export interface MapEntry { key: string; category: CategoryKey; place: Place; }
export interface MapPlace {
  key: string; longitude: number; latitude: number;
  entries: MapEntry[]; categories: CategoryKey[];
}
export interface MapSelection { pointKey: string; entryKey: string; category: CategoryKey; }

export function entryKey(place: Place, index: number): string {
  return place.id.trim() ? `${place.category}:${place.id}` : `${place.category}:empty:${index}`;
}

/** POI identity is shared across categories; empty IDs retain independent entries. */
export function mapPlaces(results: readonly CategorySearchResult[]): MapPlace[] {
  const points = new Map<string, MapPlace>();
  for (const result of results) {
    if (result.status !== "success") continue;
    result.places.forEach((place, index) => {
      if (!Number.isFinite(place.longitude) || !Number.isFinite(place.latitude) ||
        Math.abs(place.longitude) > 180 || Math.abs(place.latitude) > 90) return;
      const key = place.id.trim() ? `poi:${place.id}` : entryKey(place, index);
      let point = points.get(key);
      if (!point) {
        point = { key, longitude: place.longitude, latitude: place.latitude, entries: [], categories: [] };
        points.set(key, point);
      }
      const itemKey = entryKey(place, index);
      if (!point.entries.some(entry => entry.key === itemKey)) point.entries.push({ key: itemKey, category: place.category, place });
      if (!point.categories.includes(place.category)) point.categories.push(place.category);
    });
  }
  return [...points.values()];
}

export function selectionFor(point: MapPlace, category?: CategoryKey): MapSelection {
  const entry = point.entries.find(item => item.category === category) ?? point.entries[0]!;
  return { pointKey: point.key, entryKey: entry.key, category: entry.category };
}

export function clusterAppearance(points: readonly MapPlace[]) {
  const categories = new Set(points.flatMap(point => point.categories));
  const category = categories.size === 1 ? [...categories][0] : undefined;
  return { color: category ? CATEGORY_APPEARANCE[category].color : "#e3d4ff",
    size: MAP_METRICS.clusterSizes[points.length < 10 ? 0 : points.length < 100 ? 1 : 2] };
}

export function clusterSummary(points: readonly MapPlace[]): Partial<Record<CategoryKey, number>> {
  const counts: Partial<Record<CategoryKey, number>> = {};
  for (const point of points) for (const category of point.categories) counts[category] = (counts[category] ?? 0) + 1;
  return counts;
}

export function sameCoordinates(points: readonly MapPlace[]): boolean {
  return points.every(point => point.longitude === points[0]?.longitude && point.latitude === points[0]?.latitude);
}

export function viewportPlaces(points: readonly MapPlace[], width: number, height: number,
  project: (point: MapPlace) => { x: number; y: number }, buffer: number = MAP_METRICS.viewportBuffer): { points: MapPlace[]; visibleCount: number } {
  let visibleCount = 0;
  const visible = points.filter(point => {
    const { x, y } = project(point);
    if (x >= 0 && x <= width && y >= 0 && y <= height) visibleCount++;
    return x >= -buffer && x <= width + buffer && y >= -buffer && y <= height + buffer;
  });
  return { points: visible, visibleCount };
}
