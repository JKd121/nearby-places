import type {
  NormalizedSearchHistoryInput,
  SaveSearchHistoryInput,
} from "./contracts.js";
import { copyConfirmedLocation, isHistorySearchInput } from "./validation.js";

import {
  deleteSearchHistory as deleteSearchHistoryRecord,
  findRecentSearchHistory,
  upsertSearchHistory,
} from "./repository.js";

export function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ");
}

export function normalizeCategoryIds(categoryIds: string[]): string[] {
  return [...new Set(categoryIds)].sort();
}

export function normalizeSearchHistoryInput(
  input: SaveSearchHistoryInput,
): NormalizedSearchHistoryInput {
  const query = normalizeQuery(input.query);
  const categoryIds = normalizeCategoryIds(input.categoryIds);
  if (!isHistorySearchInput({ ...input, query, categoryIds })) {
    throw new Error("Invalid search history input");
  }
  const confirmedLocation = copyConfirmedLocation(input.confirmedLocation);

  const dedupeKey = JSON.stringify([
    query,
    categoryIds,
    input.radiusMeters,
    confirmedLocation.location.longitude,
    confirmedLocation.location.latitude,
  ]);

  return {
    visitorId: input.visitorId,
    dedupeKey,
    query,
    categoryIds,
    radiusMeters: input.radiusMeters,
    confirmedLocation,
  };
}

export async function saveSearchHistory(
  input: SaveSearchHistoryInput,
) {
  const normalized = normalizeSearchHistoryInput(input);

  return upsertSearchHistory(normalized);
}

const DEFAULT_HISTORY_LIMIT = 10;
const MAX_HISTORY_LIMIT = 20;

export async function getRecentSearchHistory(
  visitorId: string,
  limit = DEFAULT_HISTORY_LIMIT,
) {
  const safeLimit = Math.min(
    Math.max(Math.trunc(limit), 1),
    MAX_HISTORY_LIMIT,
  );

  return findRecentSearchHistory(visitorId, safeLimit);
}

export async function deleteSearchHistory(
  id: string,
  visitorId: string,
) {
  return deleteSearchHistoryRecord(id, visitorId);
}
