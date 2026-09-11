export type CategoryKey = "hotel" | "mall" | "hotpot" | "bakery" | "dessert" | "ktv" | "billiards" | "gym";
export type SearchStrategy = "keyword-only" | "types-only" | "keyword-and-types";
export type CategoryGroup = "stay" | "shopping" | "food" | "entertainment";
export type PriceMode = "none" | "per-person-sortable" | "reference-sortable" | "reference-display-only";
export type DistanceSource = "amap" | "computed";

export interface CategoryConfig {
  key: CategoryKey;
  label: string;
  group: CategoryGroup;
  keyword: string;
  /** AMap POI typecodes. All numeric typecodes are centralized here. */
  types: readonly string[];
  /** Candidate/default strategy; it may differ by category after real quality comparison. */
  strategy: SearchStrategy;
  priceMode: PriceMode;
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

export interface SearchFailure { message: string; info: string | null; infocode: string | null; }

export interface CategorySearchResult {
  category: CategoryConfig;
  status: "success" | "empty" | "error";
  places: Place[];
  page: Omit<PlacePage, "places"> | null;
  error: SearchFailure | null;
}
