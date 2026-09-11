import { CATEGORIES } from "../amap/categories.js";
import type { CategoryGroup, CategoryKey, CategorySearchResult, Place } from "../amap/types.js";
import type { SearchResponse } from "../search/contracts.js";
import { isSortModeAllowed, sortPlaces } from "../search/sort.js";
import type { SortMode } from "../search/sort.js";

export type ActiveFilter = "all" | CategoryKey;
export type GroupSelection = "none" | "partial" | "all";

export interface CategoryGroupOption {
  key: CategoryGroup;
  label: string;
  categoryIds: readonly CategoryKey[];
}

export const CATEGORY_GROUPS: readonly CategoryGroupOption[] = [
  { key: "stay", label: "住宿", categoryIds: ["hotel"] },
  { key: "shopping", label: "购物", categoryIds: ["mall"] },
  { key: "food", label: "餐饮", categoryIds: ["hotpot", "bakery", "dessert"] },
  { key: "entertainment", label: "娱乐", categoryIds: ["ktv", "billiards", "gym"] },
];

export const ALL_CATEGORY_IDS: readonly CategoryKey[] = CATEGORIES.map((category) => category.key);
export const ALLOWED_RADIUS_METERS = [1_000, 2_000, 3_000, 5_000] as const;

export function selectAllCategories(): CategoryKey[] { return [...ALL_CATEGORY_IDS]; }
export function clearCategories(): CategoryKey[] { return []; }

export function toggleCategory(selected: readonly CategoryKey[], categoryId: CategoryKey): CategoryKey[] {
  const next = new Set(selected);
  if (next.has(categoryId)) next.delete(categoryId); else next.add(categoryId);
  return ALL_CATEGORY_IDS.filter((key) => next.has(key));
}

export function getGroupSelection(selected: readonly CategoryKey[], categoryIds: readonly CategoryKey[]): GroupSelection {
  const count = categoryIds.filter((key) => selected.includes(key)).length;
  if (count === 0) return "none";
  if (count === categoryIds.length) return "all";
  return "partial";
}

export function toggleGroup(selected: readonly CategoryKey[], categoryIds: readonly CategoryKey[]): CategoryKey[] {
  const current = getGroupSelection(selected, categoryIds);
  const next = new Set(selected);
  if (current === "all") categoryIds.forEach((key) => next.delete(key));
  else categoryIds.forEach((key) => next.add(key));
  return ALL_CATEGORY_IDS.filter((key) => next.has(key));
}

export function getAvailableFilters(response: SearchResponse | null): ActiveFilter[] {
  return response ? ["all", ...response.categories.map((item) => item.category.key)] : [];
}

export function mergeSuccessfulPlaces(categories: readonly CategorySearchResult[]): Place[] {
  const seen = new Set<string>();
  const merged: Place[] = [];
  for (const result of categories) {
    if (result.status !== "success") continue;
    for (const place of result.places) {
      if (seen.has(place.id)) continue;
      seen.add(place.id);
      merged.push(place);
    }
  }
  return merged;
}

export function getPlacesForFilter(response: SearchResponse | null, filter: ActiveFilter): Place[] {
  if (!response) return [];
  if (filter === "all") return mergeSuccessfulPlaces(response.categories);
  return response.categories.find((item) => item.category.key === filter)?.places ?? [];
}

export function getCategoryResult(response: SearchResponse | null, filter: ActiveFilter): CategorySearchResult | null {
  if (!response || filter === "all") return null;
  return response.categories.find((item) => item.category.key === filter) ?? null;
}

function getSingleCategorySortModes(categoryId: CategoryKey): SortMode[] {
  const base: SortMode[] = ["distance-asc", "rating-desc"];
  return isSortModeAllowed([categoryId], "cost-asc") ? [...base, "cost-asc", "cost-desc"] : base;
}

export function getAllowedSortModes(filter: ActiveFilter, searchCategoryIds: readonly CategoryKey[] = ALL_CATEGORY_IDS): SortMode[] {
  if (filter === "all") {
    if (searchCategoryIds.length !== 1 || !searchCategoryIds[0]) return ["distance-asc", "rating-desc"];
    return getSingleCategorySortModes(searchCategoryIds[0]);
  }
  return getSingleCategorySortModes(filter);
}

export function ensureValidSortMode(mode: SortMode, filter: ActiveFilter, searchCategoryIds: readonly CategoryKey[] = ALL_CATEGORY_IDS): SortMode {
  return getAllowedSortModes(filter, searchCategoryIds).includes(mode) ? mode : "distance-asc";
}

export function sortPlacesForFilter(places: readonly Place[], mode: SortMode, filter: ActiveFilter, searchCategoryIds: readonly CategoryKey[] = ALL_CATEGORY_IDS): Place[] {
  return sortPlaces(places, ensureValidSortMode(mode, filter, searchCategoryIds));
}

export function getInitialVisibleCount(filter: ActiveFilter): number { return filter === "all" ? 20 : 10; }

export function getNextVisibleCount(filter: ActiveFilter, current: number, total: number): number {
  if (filter === "all") return Math.min(total, current + 20);
  if (current < 20) return Math.min(total, 20);
  return Math.min(total, 25);
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "暂无距离";
  return meters < 1_000 ? `${Math.round(meters)} m` : `${(meters / 1_000).toFixed(1)} km`;
}

export function formatRating(rating: number | null): string {
  return rating !== null && Number.isFinite(rating) ? `★ ${rating}` : "暂无评分";
}

export function formatCost(category: CategoryKey, cost: number | null): string | null {
  if (cost === null || !Number.isFinite(cost)) return null;
  if (category === "hotpot" || category === "bakery") return `人均 ¥${cost}`;
  if (category === "dessert" || category === "ktv" || category === "gym") return `参考消费 ¥${cost}`;
  return null;
}

export function truncateTag(tag: string | null, limit = 3): string | null {
  if (!tag) return null;
  const values = tag.split(/[,，]/).map((value) => value.trim()).filter(Boolean).slice(0, limit);
  return values.length > 0 ? values.join(" · ") : null;
}

export function resetSearchView(): { activeFilter: ActiveFilter; sortMode: SortMode; visibleCount: number } {
  return { activeFilter: "all", sortMode: "distance-asc", visibleCount: getInitialVisibleCount("all") };
}
