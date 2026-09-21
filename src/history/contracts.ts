export type SaveSearchHistoryInput = {
  visitorId: string;
  query: string;
  categoryIds: string[];
  radiusMeters: number;
};

export type NormalizedSearchHistoryInput = {
  visitorId: string;
  dedupeKey: string;
  query: string;
  categoryIds: string[];
  radiusMeters: number;
};