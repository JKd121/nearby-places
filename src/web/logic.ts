import { CATEGORIES, getCategory } from "../amap/categories.js";
import type { CategoryGroup, CategoryKey, CategorySearchResult, Place, PlacePage } from "../amap/types.js";
import type { SearchResponse } from "../search/contracts.js";
import { isCategoryCompleted } from "../search/status.js";
import { isSortModeAllowed, sortPlaces } from "../search/sort.js";
import type { SortMode } from "../search/sort.js";
import { deriveCategoryStatus } from "../search/status.js";

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
  { key: "transit", label: "交通", categoryIds: ["bus", "subway"] },
];

export const ALL_CATEGORY_IDS: readonly CategoryKey[] = CATEGORIES.map((category) => category.key);
export const ALLOWED_RADIUS_METERS = [1_000, 2_000, 3_000, 5_000] as const;

export function isTransitCategory(categoryId: CategoryKey): boolean {
  return getCategory(categoryId).group === "transit";
}

export function getEmptyStateMessage(categoryId: CategoryKey): string {
  return getCategory(categoryId).emptyState ?? "该类别暂无附近结果。";
}

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

export function getCategoryCounts(categories: readonly CategorySearchResult[]) {
  return { completed: categories.filter(item => isCategoryCompleted(item.status)).length,
    failed: categories.filter(item => item.status === "error").length,
    skipped: categories.filter(item => item.status === "skipped").length };
}

/** Merge place lists by exact non-empty IDs while preserving every empty-ID place. */
export function mergePlacesByExactId(placeLists: readonly (readonly Place[])[]): Place[] {
  const seenIds = new Set<string>();
  const merged: Place[] = [];

  for (const places of placeLists) {
    for (const place of places) {
      if (place.id.trim() !== "") {
        if (seenIds.has(place.id)) continue;
        seenIds.add(place.id);
      }
      merged.push(place);
    }
  }

  return merged;
}

export function mergeSuccessfulPlaces(categories: readonly CategorySearchResult[]): Place[] {
  return mergePlacesByExactId(
    categories.filter((result) => result.status === "success").map((result) => result.places),
  );
}

export function mergeProviderPagePlaces(existing: readonly Place[], incoming: readonly Place[]): Place[] {
  return mergePlacesByExactId([existing, incoming]);
}

/** Returns a unique render key without changing provider identity or merge semantics. */
export function getPlaceRenderKey(place: Place, index: number): string {
  return place.id.trim() === "" ? `${place.category}-empty-${index}` : `${place.category}-${place.id}`;
}

/** Selects raw provider business-hours text without reading time or parsing schedules. */
export function getBusinessHoursDisplay(place: Place): string {
  if (place.openTimeToday !== null && place.openTimeToday.trim() !== "") return `今日营业：${place.openTimeToday}`;
  if (place.openTimeWeek !== null && place.openTimeWeek.trim() !== "") return `营业时间：${place.openTimeWeek}`;
  return "营业时间暂无";
}

/** Returns a new response after one category successfully receives its fixed provider page 2. */
export function mergeProviderPageResult(
  response: SearchResponse,
  categoryId: CategoryKey,
  page: PlacePage,
): SearchResponse {
  return {
    ...response,
    categories: response.categories.map((result) => {
      if (result.category.key !== categoryId) return result;
      const { places, ...pageMetadata } = page;
      const mergedPlaces = mergeProviderPagePlaces(result.places, places);
      return { ...result, status: deriveCategoryStatus(mergedPlaces, pageMetadata), places: mergedPlaces, page: pageMetadata };
    }),
  };
}

export function resolveProviderPageCategory(
  activeFilter: ActiveFilter,
  searchCategoryIds: readonly CategoryKey[],
): CategoryKey | null {
  if (activeFilter !== "all") return activeFilter;
  return searchCategoryIds.length === 1 ? searchCategoryIds[0] ?? null : null;
}

export function canRequestSecondProviderPage(result: CategorySearchResult | null | undefined): boolean {
  if (!result || result.status !== "success" || !result.page) return false;
  return result.page.pageNumber === 1
    && result.page.returnedCount === result.page.pageSize
    && result.page.mayHaveNextApiPage;
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
  if (isTransitCategory(categoryId)) return ["distance-asc"];
  const base: SortMode[] = ["distance-asc", "rating-desc"];
  return isSortModeAllowed([categoryId], "cost-asc") ? [...base, "cost-asc", "cost-desc"] : base;
}

export function getAllowedSortModes(filter: ActiveFilter, searchCategoryIds: readonly CategoryKey[] = ALL_CATEGORY_IDS): SortMode[] {
  if (filter === "all") {
    if (searchCategoryIds.length > 0 && searchCategoryIds.every(isTransitCategory)) return ["distance-asc"];
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
  const next = current < 20 ? 20 : current < 25 ? 25 : current < 35 ? 35 : current < 45 ? 45 : 50;
  return Math.min(total, next);
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
