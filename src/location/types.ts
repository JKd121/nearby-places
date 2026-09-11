import type { Coordinates, GeocodedPlace } from "../amap/types.js";

export type QueryIntent = "PLACE_QUERY" | "ADDRESS_QUERY";

export interface LocationIntent {
  rawQuery: string;
  kind: QueryIntent;
}

export interface LocationCandidate {
  id: string | null;
  name: string;
  placeType: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  location: Coordinates;
}

export interface LocationResolverProvider {
  geocode(query: string): Promise<GeocodedPlace | null>;
  searchPlaceCandidates(query: string): Promise<readonly ProviderPlace[]>;
}

export interface ProviderPlace {
  id: string | null;
  name: string | null;
  type: string | null;
  typeCode: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  location: Coordinates | null;
  providerRank: number;
}

export type ResolutionResult =
  | { status: "confirmed"; location: LocationCandidate }
  | { status: "needs_confirmation"; candidates: LocationCandidate[] }
  | { status: "not_found"; candidates: [] };
