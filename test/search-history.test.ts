import { confirmedLocation } from "./history-fixtures.js";
import assert from "node:assert/strict";
import { mock, test } from "node:test";

const historyRows = [
  { id: "history-a", visitorId: "visitor-a" },
  { id: "history-b", visitorId: "visitor-b" },
];
const savedPlaceRows = [{ id: "saved-place-a", visitorId: "visitor-a" }];
let lastDeleteWhere: unknown;
let savedPlaceDeleteCalls = 0;
let upsertInput: unknown;
let recentRows: Array<Record<string, unknown>> = [];
let recentReads: Array<Record<string, unknown>> = [];
const dbNull = Object.freeze({ kind: "database-null" });

// The emitted generated client uses bundler imports. Only its null sentinel is
// needed at this mocked DB boundary; production builds load the real client.
mock.module("../generated/prisma/client.js", {
  exports: { Prisma: { DbNull: dbNull } },
} as unknown as Parameters<typeof mock.module>[1]);

// Mock Prisma at the DB boundary so service/repository behavior can be checked
// without loading a database URL or connecting to PostgreSQL.
mock.module("../src/db/prisma.js", {
  exports: {
    prisma: {
      searchHistory: {
        upsert: async (input: unknown) => { upsertInput = input; return {}; },
        findMany: async (input: { where: { userId: string }; take: number; cursor?: { id: string }; skip?: number }) => {
          recentReads.push(input);
          const eligible = recentRows.filter((row) => row.visitorId === input.where.userId && row.confirmedLocation !== null);
          const start = input.cursor ? eligible.findIndex((row) => row.id === input.cursor!.id) + (input.skip ?? 0) : 0;
          return eligible.slice(start, start + input.take);
        },
        deleteMany: async ({ where }: { where: { id: string; userId: string } }) => {
          lastDeleteWhere = where;
          const index = historyRows.findIndex(
            (row) => row.id === where.id && row.visitorId === where.userId,
          );
          if (index === -1) return { count: 0 };
          historyRows.splice(index, 1);
          return { count: 1 };
        },
      },
      savedPlace: {
        deleteMany: async () => {
          savedPlaceDeleteCalls += 1;
          return { count: 1 };
        },
      },
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);

const {
  normalizeCategoryIds,
  normalizeQuery,
  normalizeSearchHistoryInput,
  deleteSearchHistory,
  getRecentSearchHistory,
  saveSearchHistory,
} = await import("../src/history/service.js");

const baseInput = {
  confirmedLocation,
  visitorId: "visitor-a",
  query: "深圳 北站",
  categoryIds: ["hotpot", "hotel"],
  radiusMeters: 3000,
};

test("normalizeQuery trims outer whitespace and collapses internal whitespace", () => {
  assert.equal(normalizeQuery(" \t深圳\n\n 北站  "), "深圳 北站");
});

test("normalizeCategoryIds deduplicates and sorts without mutating its input", () => {
  const categoryIds = ["hotel", "hotpot", "hotel", "subway"];

  assert.deepEqual(normalizeCategoryIds(categoryIds), ["hotel", "hotpot", "subway"]);
  assert.deepEqual(categoryIds, ["hotel", "hotpot", "hotel", "subway"]);
});

test("equivalent query and category definitions share a dedupe key", () => {
  const canonical = normalizeSearchHistoryInput(baseInput);
  const reorderedCategories = normalizeSearchHistoryInput({
    ...baseInput,
    categoryIds: ["hotel", "hotpot"],
  });
  const duplicateCategories = normalizeSearchHistoryInput({
    ...baseInput,
    categoryIds: ["hotpot", "hotel", "hotpot"],
  });
  const whitespaceVariant = normalizeSearchHistoryInput({
    ...baseInput,
    query: "  深圳\n\t北站  ",
  });

  assert.equal(reorderedCategories.dedupeKey, canonical.dedupeKey);
  assert.equal(duplicateCategories.dedupeKey, canonical.dedupeKey);
  assert.equal(whitespaceVariant.dedupeKey, canonical.dedupeKey);
});

test("different query, category set, or radius produces a different dedupe key", () => {
  const canonical = normalizeSearchHistoryInput(baseInput);

  for (const input of [
    { ...baseInput, query: "深圳湾口岸" },
    { ...baseInput, categoryIds: ["hotpot", "subway"] },
    { ...baseInput, radiusMeters: 5000 },
  ]) {
    assert.notEqual(normalizeSearchHistoryInput(input).dedupeKey, canonical.dedupeKey);
  }
});

test("visitor identity remains part of the repository uniqueness boundary", () => {
  const firstVisitor = normalizeSearchHistoryInput(baseInput);
  const secondVisitor = normalizeSearchHistoryInput({
    ...baseInput,
    visitorId: "visitor-b",
  });

  assert.equal(firstVisitor.dedupeKey, secondVisitor.dedupeKey);
  assert.notEqual(firstVisitor.visitorId, secondVisitor.visitorId);
  assert.notDeepEqual(
    [firstVisitor.visitorId, firstVisitor.dedupeKey],
    [secondVisitor.visitorId, secondVisitor.dedupeKey],
  );
});

test("the confirmed centre distinguishes identically named searches", () => {
  const original = normalizeSearchHistoryInput(baseInput);
  const other = normalizeSearchHistoryInput({ ...baseInput, confirmedLocation: {
    ...confirmedLocation, location: { ...confirmedLocation.location, longitude: 114.04 },
  } });
  assert.notEqual(original.dedupeKey, other.dedupeKey);
  const renamed = normalizeSearchHistoryInput({ ...baseInput, confirmedLocation: {
    ...confirmedLocation, id: null, name: "更新后的名称", address: "更新后的地址",
  } });
  assert.equal(original.dedupeKey, renamed.dedupeKey);
});

test("save persists all confirmed fields and refreshes them on a repeated search", async () => {
  await saveSearchHistory(baseInput);
  const input = upsertInput as { create: Record<string, unknown>; update: Record<string, unknown> };
  assert.deepEqual(input.create.confirmedLocation, confirmedLocation);
  assert.deepEqual(input.update.confirmedLocation, confirmedLocation);
  assert.ok(input.update.searchedAt instanceof Date);
  await assert.rejects(saveSearchHistory({ ...baseInput, confirmedLocation: null } as unknown as typeof baseInput), /Invalid/);
});

test("recent limits count complete valid records without legacy rows displacing them", async () => {
  const valid = Array.from({ length: 25 }, (_, index) => ({
    ...baseInput, id: `valid-${index}`, searchedAt: new Date(2026, 9, 5),
  }));
  const legacy = Array.from({ length: 30 }, (_, index) => ({ ...valid[0], id: `legacy-${index}`, confirmedLocation: null }));
  const invalid = Array.from({ length: 15 }, (_, index) => ({ ...valid[0], id: `invalid-${index}`, confirmedLocation: { name: "缺少坐标" } }));
  recentRows = [...legacy, ...invalid, { ...valid[0], id: "other-visitor", visitorId: "visitor-b" }, ...valid];
  const before = structuredClone(recentRows);
  for (const limit of [10, 20]) {
    recentReads = [];
    const items = await getRecentSearchHistory("visitor-a", limit);
    assert.deepEqual(items.map((row) => row.id), valid.slice(0, limit).map((row) => row.id));
    assert.ok(recentReads.length > 1);
    assert.ok(recentReads.every((read) => ((read.where as Record<string, unknown>).confirmedLocation as { not: unknown }).not === dbNull));
  }
  assert.deepEqual(recentRows, before, "reading history must not delete or rewrite old rows");
  recentRows = [];
});

test("deleteSearchHistory scopes the database delete by both id and visitorId", async () => {
  historyRows.splice(0, historyRows.length,
    { id: "history-a", visitorId: "visitor-a" },
    { id: "history-b", visitorId: "visitor-b" },
  );
  savedPlaceRows.splice(0, savedPlaceRows.length, { id: "saved-place-a", visitorId: "visitor-a" });
  savedPlaceDeleteCalls = 0;

  const result = await deleteSearchHistory("history-a", "visitor-a");

  assert.deepEqual(result, { count: 1 });
  assert.deepEqual(lastDeleteWhere, { id: "history-a", userId: "visitor-a" });
  assert.deepEqual(historyRows, [{ id: "history-b", visitorId: "visitor-b" }]);
  assert.deepEqual(savedPlaceRows, [{ id: "saved-place-a", visitorId: "visitor-a" }]);
  assert.equal(savedPlaceDeleteCalls, 0);
});

test("deleteSearchHistory cannot remove another visitor's row", async () => {
  historyRows.splice(0, historyRows.length,
    { id: "history-b", visitorId: "visitor-b" },
  );

  const result = await deleteSearchHistory("history-b", "visitor-a");

  assert.deepEqual(result, { count: 0 });
  assert.deepEqual(lastDeleteWhere, { id: "history-b", userId: "visitor-a" });
  assert.deepEqual(historyRows, [{ id: "history-b", visitorId: "visitor-b" }]);
});
