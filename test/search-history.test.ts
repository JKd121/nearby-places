import assert from "node:assert/strict";
import { mock, test } from "node:test";

const historyRows = [
  { id: "history-a", visitorId: "visitor-a" },
  { id: "history-b", visitorId: "visitor-b" },
];
const savedPlaceRows = [{ id: "saved-place-a", visitorId: "visitor-a" }];
let lastDeleteWhere: unknown;
let savedPlaceDeleteCalls = 0;

// Mock Prisma at the DB boundary so service/repository behavior can be checked
// without loading a database URL or connecting to PostgreSQL.
mock.module("../src/db/prisma.js", {
  exports: {
    prisma: {
      searchHistory: {
        upsert: async () => ({}),
        findMany: async () => [],
        deleteMany: async ({ where }: { where: { id: string; visitorId: string } }) => {
          lastDeleteWhere = where;
          const index = historyRows.findIndex(
            (row) => row.id === where.id && row.visitorId === where.visitorId,
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
} = await import("../src/history/service.js");

const baseInput = {
  visitorId: "visitor-a",
  query: "深圳 北站",
  categoryIds: ["food", "hotel"],
  radiusMeters: 3000,
};

test("normalizeQuery trims outer whitespace and collapses internal whitespace", () => {
  assert.equal(normalizeQuery(" \t深圳\n\n 北站  "), "深圳 北站");
});

test("normalizeCategoryIds deduplicates and sorts without mutating its input", () => {
  const categoryIds = ["hotel", "food", "hotel", "subway"];

  assert.deepEqual(normalizeCategoryIds(categoryIds), ["food", "hotel", "subway"]);
  assert.deepEqual(categoryIds, ["hotel", "food", "hotel", "subway"]);
});

test("equivalent query and category definitions share a dedupe key", () => {
  const canonical = normalizeSearchHistoryInput(baseInput);
  const reorderedCategories = normalizeSearchHistoryInput({
    ...baseInput,
    categoryIds: ["hotel", "food"],
  });
  const duplicateCategories = normalizeSearchHistoryInput({
    ...baseInput,
    categoryIds: ["food", "hotel", "food"],
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
    { ...baseInput, categoryIds: ["food", "subway"] },
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

test("deleteSearchHistory scopes the database delete by both id and visitorId", async () => {
  historyRows.splice(0, historyRows.length,
    { id: "history-a", visitorId: "visitor-a" },
    { id: "history-b", visitorId: "visitor-b" },
  );
  savedPlaceRows.splice(0, savedPlaceRows.length, { id: "saved-place-a", visitorId: "visitor-a" });
  savedPlaceDeleteCalls = 0;

  const result = await deleteSearchHistory("history-a", "visitor-a");

  assert.deepEqual(result, { count: 1 });
  assert.deepEqual(lastDeleteWhere, { id: "history-a", visitorId: "visitor-a" });
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
  assert.deepEqual(lastDeleteWhere, { id: "history-b", visitorId: "visitor-a" });
  assert.deepEqual(historyRows, [{ id: "history-b", visitorId: "visitor-b" }]);
});
