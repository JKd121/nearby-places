import { prisma } from "../db/prisma.js";

import type { NormalizedSearchHistoryInput } from "./contracts.js";

export async function upsertSearchHistory(
  input: NormalizedSearchHistoryInput,
) {
  return prisma.searchHistory.upsert({
    where: {
      visitorId_dedupeKey: {
        visitorId: input.visitorId,
        dedupeKey: input.dedupeKey,
      },
    },

    create: {
      visitorId: input.visitorId,
      dedupeKey: input.dedupeKey,
      query: input.query,
      categoryIds: input.categoryIds,
      radiusMeters: input.radiusMeters,
    },

    update: {
      searchedAt: new Date(),
    },
  });
}