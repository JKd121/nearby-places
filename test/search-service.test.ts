import assert from "node:assert/strict";
import test from "node:test";
import { AmapApiError } from "../src/amap/client.js";
import { CATEGORIES } from "../src/amap/categories.js";
import { executeResolvedSearch, executeSearch, executeSecondPageSearch } from "../src/search/service.js";
import type { GeocodedPlace, PlacePage } from "../src/amap/types.js";
import { AdmissionError } from "../src/admission/errors.js";
import { createRequestContext } from "../src/amap/request-context.js";
import { classifyError } from "../src/errors/classify.js";
import type { DiagnosticFields, DiagnosticEvent, DiagnosticStage, Diagnostics } from "../src/diagnostics.js";

const centre: GeocodedPlace = { query: "深圳北站", formattedAddress: "深圳北站", province: "广东省", city: "深圳市", district: "龙华区", longitude: 114, latitude: 22, level: "兴趣点" };
const emptyPage: PlacePage = { places: [], pageNumber: 1, pageSize: 25, returnedCount: 0, mayHaveNextApiPage: false };

function diagnosticsRecorder() {
  const events: { event: DiagnosticEvent; stage: DiagnosticStage; fields: DiagnosticFields | undefined }[] = [];
  const diagnostics: Diagnostics = {
    async measure(_stage, operation) { return operation(); },
    measureSync(_stage, operation) { return operation(); },
    event(event, stage, fields) { events.push({ event, stage, fields }); },
    annotate() {}, error() {},
  };
  return { diagnostics, events };
}

test("stop diagnostic records one safe event without changing partial response or later calls", async () => {
  const { diagnostics, events } = diagnosticsRecorder();
  const request = { center: centre, resolvedLocation: centre, categoryIds: ["hotel", "mall", "hotpot", "bakery"] as const, radiusMeters: 3000 as const };
  const calls: string[] = [];
  const client = { geocode: async () => centre, searchNearby: async (_center: unknown, category: (typeof CATEGORIES)[number]) => {
    calls.push(category.key); if (category.key === "hotpot") throw new AdmissionError("ADMISSION_WAIT_EXCEEDED"); return emptyPage;
  } };
  const withDiagnostics = await executeResolvedSearch({ ...request, categoryIds: [...request.categoryIds] }, client, async () => {}, diagnostics);
  assert.deepEqual(calls, ["hotel", "mall", "hotpot"]);
  assert.deepEqual(withDiagnostics.termination, { code: "ADMISSION_WAIT_EXCEEDED", categoryId: "hotpot" });
  assert.deepEqual(withDiagnostics.categories.map(item => item.status), ["empty", "empty", "error", "skipped"]);
  assert.deepEqual(events.filter(item => String(item.event) === "search.stopped"), [{ event: "search.stopped", stage: "request", fields: { category: "hotpot", code: "ADMISSION_WAIT_EXCEEDED", completedCount: 2, skippedCount: 1 } }]);
  assert.equal(events.filter(item => item.event === "search.category.completed" && item.fields?.category === "hotpot" && item.fields?.outcome === "error").length, 1);
  calls.length = 0;
  const withoutDiagnostics = await executeResolvedSearch({ ...request, categoryIds: [...request.categoryIds] }, client, async () => {});
  assert.deepEqual(withDiagnostics, withoutDiagnostics);
});

test("normal completion and recoverable errors do not produce a stop event", async () => {
  for (const recover of [false, true]) {
    const { diagnostics, events } = diagnosticsRecorder();
    const response = await executeResolvedSearch({ center: centre, resolvedLocation: centre, categoryIds: ["hotel", "mall"], radiusMeters: 3000 }, {
      geocode: async () => centre,
      searchNearby: async (_center, category) => { if (recover && category.key === "hotel") throw new AmapApiError("ignored", null, null, "UPSTREAM_NETWORK"); return emptyPage; },
    }, async () => {}, diagnostics);
    assert.equal(response.status, recover ? "partial success" : "success");
    assert.equal(events.filter(item => String(item.event) === "search.stopped").length, 0);
  }
});

test("first-category stop emits a safe diagnostic while preserving the original error", async () => {
  const { diagnostics, events } = diagnosticsRecorder();
  const failure = new AdmissionError("ADMISSION_UNAVAILABLE");
  let calls = 0;
  await assert.rejects(executeResolvedSearch({ center: centre, resolvedLocation: centre, categoryIds: ["hotel", "mall"], radiusMeters: 3000 }, {
    geocode: async () => centre, searchNearby: async () => { calls++; throw failure; },
  }, async () => {}, diagnostics), error => error === failure);
  assert.equal(calls, 1);
  assert.deepEqual(events.filter(item => String(item.event) === "search.stopped"), [{ event: "search.stopped", stage: "request", fields: { category: "hotel", code: "ADMISSION_UNAVAILABLE", completedCount: 0, skippedCount: 1 } }]);
});

test("authentication stop diagnostics expose only the fixed public code", async () => {
  const { diagnostics, events } = diagnosticsRecorder();
  await executeResolvedSearch({ center: centre, resolvedLocation: centre, categoryIds: ["hotel", "mall", "hotpot"], radiusMeters: 3000 }, {
    geocode: async () => centre,
    searchNearby: async (_center, category) => { if (category.key === "mall") throw new AmapApiError("SECRET raw error", null, "10001", "UPSTREAM_AUTH_FAILED"); return emptyPage; },
  }, async () => {}, diagnostics);
  assert.deepEqual(events.filter(item => item.event === "search.stopped"), [{ event: "search.stopped", stage: "request", fields: { category: "mall", code: "SERVICE_UNAVAILABLE", completedCount: 1, skippedCount: 1 } }]);
  assert.equal(JSON.stringify(events).includes("SECRET"), false);
  assert.equal(JSON.stringify(events).includes("10001"), false);
});

test("a stop error preserves completed categories and skips all remaining calls", async () => {
  const calls: string[] = [];
  const context = createRequestContext();
  try {
    const response = await executeResolvedSearch({center: centre, resolvedLocation: centre, categoryIds: ["hotel", "mall", "hotpot", "bakery"], radiusMeters: 3000}, {
      geocode: async () => centre,
      searchNearby: async (_center, category) => { calls.push(category.key); if (category.key === "hotpot") throw new AdmissionError("ADMISSION_WAIT_EXCEEDED"); return emptyPage; },
    }, async () => {}, undefined, context);
    assert.deepEqual(calls, ["hotel", "mall", "hotpot"]);
    assert.deepEqual(response.categories.map(c => c.status), ["empty", "empty", "error", "skipped"]);
    assert.deepEqual((response as unknown as { termination: unknown }).termination, { code: "ADMISSION_WAIT_EXCEEDED", categoryId: "hotpot" });
    assert.equal(response.status, "partial success");
    assert.equal(context.signal.aborted, false);
  } finally { context.dispose(); }
});

test("one upstream timeout is a category failure and later categories still execute", async () => {
  const calls: string[] = [];
  const response = await executeResolvedSearch({center: centre, resolvedLocation: centre, categoryIds: ["hotel", "mall"], radiusMeters: 3000}, {
    geocode: async () => centre,
    searchNearby: async (_center, category) => { calls.push(category.key); if (category.key === "hotel") throw new AmapApiError("timeout", null, null, "UPSTREAM_TIMEOUT"); return emptyPage; },
  }, async () => {});
  assert.deepEqual(calls, ["hotel", "mall"]);
  assert.deepEqual(response.categories.map(c => c.status), ["error", "empty"]);
});

test("unexpected internal errors cannot be converted to category errors", async () => {
  let calls = 0;
  await assert.rejects(executeResolvedSearch({center: centre, resolvedLocation: centre, categoryIds: ["hotel", "mall"], radiusMeters: 3000}, {
    geocode: async () => centre, searchNearby: async () => { calls++; throw new Error("internal defect"); },
  }, async () => {}), /internal defect/);
  assert.equal(calls, 1);
});

test("classification uses typed codes and fails closed for unknown exceptions", () => {
  for (const code of ["UPSTREAM_NETWORK", "UPSTREAM_HTTP", "UPSTREAM_TIMEOUT", "UPSTREAM_BUSINESS", "UPSTREAM_INVALID_JSON", "UPSTREAM_INVALID_PAYLOAD", "UPSTREAM_BODY_TOO_LARGE"] as const)
    assert.equal(classifyError(new AmapApiError("", null, null, code)), "recover");
  for (const code of ["ADMISSION_WAIT_EXCEEDED", "ADMISSION_UNAVAILABLE", "DAILY_BUDGET_EXHAUSTED", "MONTHLY_BUDGET_EXHAUSTED", "UPSTREAM_AUTH_FAILED"] as const)
    assert.equal(classifyError(new AmapApiError("", null, null, code)), "stop");
  for (const code of ["REQUEST_CANCELLED", "REQUEST_DEADLINE_EXCEEDED", "REQUEST_BODY_TOO_LARGE"] as const)
    assert.equal(classifyError(new AmapApiError("", null, null, code)), "abort");
  assert.equal(classifyError(new AmapApiError("", null, null, "UPSTREAM_HTTP", 401)), "stop");
  assert.equal(classifyError(new Error("UPSTREAM_TIMEOUT")), "fatal");
});

for (const code of ["ADMISSION_WAIT_EXCEEDED", "ADMISSION_UNAVAILABLE", "DAILY_BUDGET_EXHAUSTED", "MONTHLY_BUDGET_EXHAUSTED"] as const) {
  test(`${code}: first failure propagates; final failure preserves empty completion`, async () => {
    const request = {center: centre, resolvedLocation: centre, categoryIds: ["hotel", "mall"] as const, radiusMeters: 3000 as const};
    let calls = 0;
    const failing = { geocode: async () => centre, searchNearby: async () => { calls++; throw new AdmissionError(code); } };
    await assert.rejects(executeResolvedSearch({...request, categoryIds: [...request.categoryIds]}, failing, async () => {}), (e: unknown) => e instanceof AdmissionError && e.code === code);
    assert.equal(calls, 1);
    calls = 0;
    const partial = await executeResolvedSearch({...request, categoryIds: [...request.categoryIds]}, { ...failing, searchNearby: async () => { if (++calls === 1) return emptyPage; throw new AdmissionError(code); } }, async () => {});
    assert.deepEqual(partial.categories.map(c => c.status), ["empty", "error"]);
    assert.deepEqual(partial.termination, { code, categoryId: "mall" });
  });
}

test("consecutive recoverable errors continue but no completed category yields controlled failure", async () => {
  let calls = 0;
  await assert.rejects(executeResolvedSearch({center: centre, resolvedLocation: centre, categoryIds: ["hotel", "mall"], radiusMeters: 3000}, {
    geocode: async () => centre, searchNearby: async () => { calls++; throw new AmapApiError("safe", null, null, "UPSTREAM_NETWORK"); },
  }, async () => {}), (e: unknown) => e instanceof AmapApiError && e.code === "ALL_CATEGORIES_FAILED");
  assert.equal(calls, 2);
});

test("abort and deadline never become partial results", async () => {
  for (const code of ["REQUEST_CANCELLED", "REQUEST_DEADLINE_EXCEEDED"] as const) {
    let calls = 0;
    await assert.rejects(executeResolvedSearch({center: centre, resolvedLocation: centre, categoryIds: ["hotel", "mall"], radiusMeters: 3000}, {
      geocode: async () => centre, searchNearby: async () => { if (++calls === 1) return emptyPage; throw new AmapApiError("", null, null, code); },
    }, async () => {}), (e: unknown) => e instanceof AmapApiError && e.code === code);
    assert.equal(calls, 2);
  }
});

test("product search uses page 1/25, preserves order and isolates structured AMap errors", async () => {
  const selected = [CATEGORIES[1]!, CATEGORIES[0]!];
  const optionsSeen: unknown[] = [];
  const response = await executeSearch({ query: centre.query, categoryIds: selected.map((item) => item.key), radiusMeters: 3000 }, {
    geocode: async () => centre,
    searchNearby: async (_location, category, options) => {
      optionsSeen.push(options);
      if (category.key === selected[0]!.key) throw new AmapApiError("limited", "CUQPS_HAS_EXCEEDED_THE_LIMIT", "10021");
      return emptyPage;
    }
  }, async () => {});
  assert.deepEqual(response.categories.map((item) => item.category.key), selected.map((item) => item.key));
  assert.equal(response.categories[0]?.status, "error");
  assert.equal(response.categories[0]?.error?.info, null);
  assert.equal(response.categories[0]?.error?.infocode, null);
  assert.equal(response.categories[0]?.error?.message.includes("limited"), false);
  assert.equal(response.categories[1]?.status, "empty");
  assert.equal(response.status, "partial success");
  assert.deepEqual(optionsSeen, [{ radiusMeters: 3000, pageNumber: 1, pageSize: 25 }, { radiusMeters: 3000, pageNumber: 1, pageSize: 25 }]);
});

test("a full raw page of rejected transit children stays eligible for page 2", async () => {
  const response = await executeResolvedSearch({
    center: { longitude: centre.longitude, latitude: centre.latitude },
    resolvedLocation: centre,
    categoryIds: ["subway"],
    radiusMeters: 3000,
  }, {
    geocode: async () => centre,
    searchNearby: async () => ({ places: [], pageNumber: 1, pageSize: 25, returnedCount: 25, mayHaveNextApiPage: true }),
  }, async () => {});
  assert.equal(response.categories[0]?.status, "success");
  assert.equal(response.categories[0]?.places.length, 0);
  assert.equal(response.categories[0]?.page?.returnedCount, 25);
});

test("confirmed search uses the resolved centre without geocoding again", async () => {
  let geocodeCalled = false;
  const response = await executeResolvedSearch({
    center: { longitude: centre.longitude, latitude: centre.latitude },
    resolvedLocation: centre,
    categoryIds: [CATEGORIES[0]!.key],
    radiusMeters: 3000,
  }, {
    geocode: async () => { geocodeCalled = true; return centre; },
    searchNearby: async (location) => {
      assert.deepEqual(location, centre);
      return emptyPage;
    },
  }, async () => {});
  assert.equal(geocodeCalled, false);
  assert.equal(response.status, "success");
});

test("second-page search makes one direct provider call with fixed page 2/25", async () => {
  const category = CATEGORIES[2]!;
  const center = { longitude: 114.029, latitude: 22.609 };
  const page: PlacePage = { places: [], pageNumber: 2, pageSize: 25, returnedCount: 0, mayHaveNextApiPage: false };
  const calls: unknown[] = [];
  const response = await executeSecondPageSearch({ center, categoryId: category.key, radiusMeters: 2000 }, {
    geocode: async () => { throw new Error("second-page search must not geocode"); },
    searchNearby: async (receivedCenter, receivedCategory, options) => {
      calls.push({ receivedCenter, receivedCategory, options });
      return page;
    },
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    receivedCenter: center,
    receivedCategory: category,
    options: { radiusMeters: 2000, pageNumber: 2, pageSize: 25 },
  });
  assert.deepEqual(response, { categoryId: category.key, page });
});

test("second-page search propagates provider failure without retry", async () => {
  let calls = 0;
  const failure = new AmapApiError("limited", "CUQPS_HAS_EXCEEDED_THE_LIMIT", "10021");
  await assert.rejects(executeSecondPageSearch({ center: { longitude: 114, latitude: 22 }, categoryId: CATEGORIES[0]!.key, radiusMeters: 3000 }, {
    geocode: async () => { throw new Error("second-page search must not geocode"); },
    searchNearby: async () => { calls += 1; throw failure; },
  }), (error: unknown) => error === failure);
  assert.equal(calls, 1);
});
