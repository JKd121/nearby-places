import assert from "node:assert/strict";
import { mock, test } from "node:test";

// The history service imports the repository eagerly.  Replacing that boundary
// lets these unit tests exercise normalization without loading Prisma or a URL.
mock.module("../src/history/repository.js", {
  exports: {
    upsertSearchHistory: async () => {
      throw new Error("repository must not be called by normalization tests");
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);

const {
  normalizeCategoryIds,
  normalizeQuery,
  normalizeSearchHistoryInput,
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
