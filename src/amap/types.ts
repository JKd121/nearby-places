export type CategoryKey = "hotel" | "mall" | "hotpot" | "bakery" | "dessert" | "ktv" | "billiards" | "gym" | "bus" | "subway";
export type SearchStrategy = "keyword-only" | "types-only" | "keyword-and-types";
export type CategoryGroup = "stay" | "shopping" | "food" | "entertainment" | "transit";
export type PriceMode = "none" | "per-person-sortable" | "reference-sortable" | "reference-display-only";
export type DistanceSource = "amap" | "computed";

export interface CategoryConfig {
  key: CategoryKey;
  label: string;
  group: CategoryGroup;
  keyword: string;
  /** AMap POI typecodes. All numeric typecodes are centralized here. */
  types: readonly string[];
  /** Optional exact acceptance set for providers whose parent type query returns child POIs. */
  acceptedTypecodes?: readonly string[];
  /** Candidate/default strategy; it may differ by category after real quality comparison. */
  strategy: SearchStrategy;
  priceMode: PriceMode;
  /** Optional category-specific empty-state copy. */
  emptyState?: string;
  /** Provider source note for codes that require periodic revalidation. */
  typecodeSource?: string;
}

export interface Coordinates { longitude: number; latitude: number; }

export interface GeocodedPlace extends Coordinates {
  query: string;
  formattedAddress: string;
  province: string | null;
  city: string | null;
  district: string | null;
  level: string | null;
}

export interface Place extends Coordinates {
  id: string;
  /** AMap's nullable parent POI ID; retained for provider hierarchy diagnostics. */
  parentId: string | null;
  name: string;
  category: CategoryKey;
  /** Valid AMap native distance, otherwise the local Haversine fallback. */
  distanceMeters: number;
  distanceSource: DistanceSource;
  amapDistanceMeters: number | null;
  /** Always-computed local straight-line Haversine distance. */
  computedDistanceMeters: number;
  type: string | null;
  typecode: string | null;
  cost: number | null;
  rating: number | null;
  tag: string | null;
  /** Raw provider business-hours text; intentionally not parsed or interpreted. */
  openTimeToday: string | null;
  openTimeWeek: string | null;
  address: string;
}

export interface NearbySearchOptions {
  radiusMeters: number;
  pageNumber: number;
  pageSize: number;
  strategy?: SearchStrategy;
}

export interface PlacePage {
  places: Place[];
  pageNumber: number;
  pageSize: number;
  returnedCount: number;
  /** This only indicates that another API page may exist. */
  mayHaveNextApiPage: boolean;
}

export type CategoryStatus = "success" | "empty" | "error" | "skipped";
export interface SearchFailure { message: string; info: string | null; infocode: string | null; code?: import("../errors/classify.js").PublicSearchErrorCode; }

export interface CategorySearchResult {
  category: CategoryConfig;
  status: CategoryStatus;
  places: Place[];
  page: Omit<PlacePage, "places"> | null;
  error: SearchFailure | null;
}
