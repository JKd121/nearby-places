import type { CategoryConfig, CategoryKey } from "./types.js";

/** AMap POI classification reference: https://lbs.amap.com/api/webservice/download (recheck when provider tables update). */
export const AMAP_POI_TYPECODE_SOURCE = "高德 POI 分类编码表（来源页 2023-10-13；本次复核 2026-09-20；需随高德更新复核）";

export const CATEGORIES: readonly CategoryConfig[] = [
  { key: "hotel", label: "酒店", group: "stay", keyword: "酒店", types: ["100100"], strategy: "types-only", priceMode: "none" },
  { key: "mall", label: "商场", group: "shopping", keyword: "商场", types: ["060100"], strategy: "types-only", priceMode: "none" },
  { key: "hotpot", label: "火锅", group: "food", keyword: "火锅", types: ["050117"], strategy: "types-only", priceMode: "per-person-sortable" },
  { key: "bakery", label: "面包", group: "food", keyword: "面包", types: ["050800"], strategy: "types-only", priceMode: "per-person-sortable" },
  { key: "dessert", label: "甜品", group: "food", keyword: "甜品", types: ["050900"], strategy: "types-only", priceMode: "per-person-sortable" },
  { key: "ktv", label: "KTV", group: "entertainment", keyword: "KTV", types: ["080302"], strategy: "types-only", priceMode: "reference-sortable" },
  { key: "billiards", label: "台球厅", group: "entertainment", keyword: "台球厅", types: ["080113"], strategy: "types-only", priceMode: "none" },
  { key: "gym", label: "健身房", group: "entertainment", keyword: "健身房", types: ["080111"], strategy: "types-only", priceMode: "reference-display-only" },
  // 150700 is intentionally a broad query: live samples include legitimate
  // child variants such as ordinary, tourist, airport and rapid-bus stops.
  { key: "bus", label: "公交站", group: "transit", keyword: "公交站", types: ["150700"], strategy: "types-only", priceMode: "none", emptyState: "当前范围内暂无公交站", typecodeSource: AMAP_POI_TYPECODE_SOURCE },
  { key: "subway", label: "地铁站", group: "transit", keyword: "地铁站", types: ["150500"], acceptedTypecodes: ["150500"], strategy: "types-only", priceMode: "none", emptyState: "当前范围内暂无地铁站", typecodeSource: AMAP_POI_TYPECODE_SOURCE },
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
