import { getCategory } from "../amap/categories.js";
import type { CategoryKey, Place } from "../amap/types.js";

export type SortMode = "distance-asc" | "rating-desc" | "cost-asc" | "cost-desc";

export function isSortModeAllowed(categoryIds: readonly CategoryKey[], mode: SortMode): boolean {
  if (mode !== "cost-asc" && mode !== "cost-desc") return true;
  if (categoryIds.length !== 1) return false;
  const priceMode = getCategory(categoryIds[0]!).priceMode;
  return priceMode === "per-person-sortable" || priceMode === "reference-sortable";
}

function compareNullable(left: number | null, right: number | null, direction: 1 | -1): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return (left - right) * direction;
}

export function sortPlaces(places: readonly Place[], mode: SortMode): Place[] {
  return [...places].sort((left, right) => {
    let primary = 0;
    if (mode === "distance-asc") primary = left.distanceMeters - right.distanceMeters;
    if (mode === "rating-desc") primary = compareNullable(left.rating, right.rating, -1);
    if (mode === "cost-asc") primary = compareNullable(left.cost, right.cost, 1);
    if (mode === "cost-desc") primary = compareNullable(left.cost, right.cost, -1);
    return primary || left.distanceMeters - right.distanceMeters || left.name.localeCompare(right.name, "zh-CN") || left.id.localeCompare(right.id);
  });
}
