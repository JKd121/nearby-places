import { prisma } from "../db/prisma.js";

import type { NormalizedSearchHistoryInput } from "./contracts.js";
import { Prisma, type SearchHistory } from "../../generated/prisma/client.js";
import type { LocationCandidate } from "../location/types.js";
import { copyConfirmedLocation, isConfirmedLocation, isHistorySearchInput } from "./validation.js";

export async function upsertSearchHistory(
  input: NormalizedSearchHistoryInput,
) {
  const record = await prisma.searchHistory.upsert({
    where: input.userId ? { userId_dedupeKey: { userId: input.userId, dedupeKey: input.dedupeKey } } : {
      visitorId_dedupeKey: {
        visitorId: input.visitorId,
        dedupeKey: input.dedupeKey,
      },
    },

    create: {
      visitorId: input.userId ? null : input.visitorId,
      ...(input.userId ? { userId: input.userId } : {}),
      dedupeKey: input.dedupeKey,
      query: input.query,
      categoryIds: input.categoryIds,
      radiusMeters: input.radiusMeters,
      confirmedLocation: { ...copyConfirmedLocation(input.confirmedLocation) },
    },

    update: {
      searchedAt: new Date(),
      confirmedLocation: { ...copyConfirmedLocation(input.confirmedLocation) },
    },
  });
  return { ...record, confirmedLocation: copyConfirmedLocation(input.confirmedLocation) };
}

export async function findRecentSearchHistory(
  visitorId: string,
  limit: number,
) {
  // Apply the visible limit to valid records, so legacy/invalid rows do not crowd
  // out usable history. Nullable legacy rows are excluded by the database.
  const items: Array<Omit<SearchHistory, "confirmedLocation"> & { confirmedLocation: LocationCandidate }> = [];
  let cursor: string | undefined;
  while (items.length < limit) {
    const rows = await prisma.searchHistory.findMany({
      where: { userId: visitorId, confirmedLocation: { not: Prisma.DbNull } },
      orderBy: [{ searchedAt: "desc" }, { id: "desc" }],
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const row of rows) {
      const location = row.confirmedLocation;
      if (isConfirmedLocation(location) && isHistorySearchInput({ ...row, confirmedLocation: location })) {
        items.push({ ...row, confirmedLocation: copyConfirmedLocation(location) });
        if (items.length === limit) break;
      }
    }
    if (rows.length < limit) break;
    cursor = rows.at(-1)?.id;
  }
  return items;
}

export async function deleteSearchHistory(
  id: string,
  visitorId: string,
) {
  return prisma.searchHistory.deleteMany({
    where: {
      id,
      userId: visitorId,
    },
  });
}
