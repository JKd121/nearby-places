import type { CategoryConfig, CategoryKey } from "./types.js";

export const CATEGORIES: readonly CategoryConfig[] = [
  { key: "hotel", label: "酒店", group: "stay", keyword: "酒店", types: ["100100"], strategy: "types-only", priceMode: "none" },
  { key: "mall", label: "商场", group: "shopping", keyword: "商场", types: ["060100"], strategy: "types-only", priceMode: "none" },
  { key: "hotpot", label: "火锅", group: "food", keyword: "火锅", types: ["050117"], strategy: "types-only", priceMode: "per-person-sortable" },
  { key: "bakery", label: "面包", group: "food", keyword: "面包", types: ["050800"], strategy: "types-only", priceMode: "per-person-sortable" },
  { key: "dessert", label: "甜品", group: "food", keyword: "甜品", types: ["050900"], strategy: "types-only", priceMode: "per-person-sortable" },
  { key: "ktv", label: "KTV", group: "entertainment", keyword: "KTV", types: ["080302"], strategy: "types-only", priceMode: "reference-sortable" },
  { key: "billiards", label: "台球厅", group: "entertainment", keyword: "台球厅", types: ["080113"], strategy: "types-only", priceMode: "none" },
  { key: "gym", label: "健身房", group: "entertainment", keyword: "健身房", types: ["080111"], strategy: "types-only", priceMode: "reference-display-only" }
];

const BY_KEY = new Map(CATEGORIES.map((category) => [category.key, category]));

export function getCategory(key: CategoryKey): CategoryConfig {
  const category = BY_KEY.get(key);
  if (!category) throw new Error(`Unknown category: ${key}`);
  return category;
}

export function isCategoryKey(value: string): value is CategoryKey {
  return BY_KEY.has(value as CategoryKey);
}
