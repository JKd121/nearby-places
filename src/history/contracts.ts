import type { LocationCandidate } from "../location/types.js";

export type HistorySearchInput = {
  query: string;
  categoryIds: string[];
  radiusMeters: number;
  confirmedLocation: LocationCandidate;
};

export type SaveSearchHistoryInput = HistorySearchInput & { visitorId: string };

export type NormalizedSearchHistoryInput = SaveSearchHistoryInput & {
  dedupeKey: string;
};
