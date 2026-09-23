import assert from "node:assert/strict";
import { mock, test } from "node:test";

type HistoryItem = {
  id: string;
  query: string;
  categoryIds: string[];
  radiusMeters: number;
  searchedAt: Date;
  visitorId: string;
  dedupeKey: string;
};

let cookieValue: string | undefined;
const cookieSets: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
let saveInput: Record<string, unknown> | undefined;
let recentVisitorId: string | undefined;
let deletedHistoryRows: Array<{ id: string; visitorId: string }> = [];
let deleteInputs: Array<{ id: string; visitorId: string }> = [];

const cookieStore = {
  get(name: string) {
    return cookieValue === undefined ? undefined : { name, value: cookieValue };
  },
  set(name: string, value: string, options: Record<string, unknown>) {
    cookieValue = value;
    cookieSets.push({ name, value, options });
  },
};

const serviceMock = {
  saveSearchHistory: async (input: Record<string, unknown>) => {
    saveInput = input;
    return {
      id: "history-1",
      query: input.query as string,
      categoryIds: input.categoryIds as string[],
      radiusMeters: input.radiusMeters as number,
      searchedAt: new Date("2026-09-22T01:02:03.000Z"),
      visitorId: input.visitorId as string,
      dedupeKey: "secret-dedupe-key",
    } satisfies HistoryItem;
  },
  getRecentSearchHistory: async (visitorId: string) => {
    recentVisitorId = visitorId;
    return [{
      id: "history-2",
      query: "深圳北站",
      categoryIds: ["food"],
      radiusMeters: 3000,
      searchedAt: new Date("2026-09-22T04:05:06.000Z"),
      visitorId,
      dedupeKey: "secret-dedupe-key",
    } satisfies HistoryItem];
  },
  deleteSearchHistory: async (id: string, visitorId: string) => {
    deleteInputs.push({ id, visitorId });
    const index = deletedHistoryRows.findIndex(
      (item) => item.id === id && item.visitorId === visitorId,
    );
    if (index === -1) return { count: 0 };
    deletedHistoryRows.splice(index, 1);
    return { count: 1 };
  },
};

const globals = globalThis as typeof globalThis & {
  __historyCookies: () => Promise<typeof cookieStore>;
  __historyNextResponse: { json: (body: unknown, init?: ResponseInit) => Response };
};
globals.__historyCookies = async () => cookieStore;
globals.__historyNextResponse = { json: (body, init) => Response.json(body, init) };
mock.module("../src/history/service.js", {
  exports: serviceMock,
} as unknown as Parameters<typeof mock.module>[1]);

const historyRouteModule = "../app/api/history/route.js";
const { GET, POST, DELETE } = await import(historyRouteModule);

const routeUrl = "http://localhost/api/history";

function request(body: string | object): Request {
  return new Request(routeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function deleteRequest(body: string | object): Request {
  return new Request(routeUrl, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function resetState(visitorId?: string): void {
  cookieValue = visitorId;
  cookieSets.length = 0;
  saveInput = undefined;
  recentVisitorId = undefined;
  deleteInputs = [];
  deletedHistoryRows = [
    { id: "history-a", visitorId: "visitor-a" },
    { id: "history-b", visitorId: "visitor-b" },
  ];
}

test("DELETE removes the current visitor's history row", async () => {
  resetState("visitor-a");

  const response = await DELETE(deleteRequest({ id: "history-a" }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: true });
  assert.deepEqual(deleteInputs, [{ id: "history-a", visitorId: "visitor-a" }]);
  assert.deepEqual(deletedHistoryRows, [{ id: "history-b", visitorId: "visitor-b" }]);
});

test("DELETE hides wrong-owner and missing ids behind the same 404 and leaves the other row", async () => {
  resetState("visitor-a");

  const response = await DELETE(deleteRequest({ id: "history-b" }));

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Search history not found" });
  assert.deepEqual(deleteInputs, [{ id: "history-b", visitorId: "visitor-a" }]);
  assert.deepEqual(deletedHistoryRows, [
    { id: "history-a", visitorId: "visitor-a" },
    { id: "history-b", visitorId: "visitor-b" },
  ]);

  const missingResponse = await DELETE(deleteRequest({ id: "not-found" }));

  assert.equal(missingResponse.status, 404);
  assert.deepEqual(await missingResponse.json(), { error: "Search history not found" });
  assert.deepEqual(deletedHistoryRows, [
    { id: "history-a", visitorId: "visitor-a" },
    { id: "history-b", visitorId: "visitor-b" },
  ]);
});

test("DELETE rejects malformed JSON and invalid ids", async () => {
  for (const body of ["{", "{}", '{"id":3}', '{"id":null}', '{"id":""}', '{"id":"  "}']) {
    resetState("visitor-a");
    const response = await DELETE(deleteRequest(body));
    assert.equal(response.status, 400);
    assert.deepEqual(
      await response.json(),
      body === "{" ? { error: "Invalid JSON body" } : { error: "Invalid search history input" },
    );
    assert.deepEqual(deleteInputs, []);
  }
});

test("DELETE does not accept a client-supplied visitorId", async () => {
  resetState("visitor-a");

  const response = await DELETE(deleteRequest({ id: "history-a", visitorId: "visitor-b" }));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid search history input" });
  assert.deepEqual(deleteInputs, []);
});

test("POST rejects invalid JSON with the public error", async () => {
  resetState();
  const response = await POST(request("{"));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid JSON body" });
});

test("POST rejects invalid business input", async () => {
  for (const body of [
    { query: "", categoryIds: ["food"], radiusMeters: 3000 },
    { query: "深圳北站", categoryIds: [], radiusMeters: 3000 },
    { query: "深圳北站", categoryIds: ["food"], radiusMeters: 0 },
    { query: "深圳北站", categoryIds: ["food"], radiusMeters: -1 },
  ]) {
    resetState();
    const response = await POST(request(body));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Invalid search history input" });
  }
  assert.equal(saveInput, undefined);
});

test("POST reuses a visitor cookie, passes the business input, and strips private fields", async () => {
  resetState("visitor-existing");
  const response = await POST(request({ query: " 深圳北站 ", categoryIds: ["food", "hotel"], radiusMeters: 3000 }));

  assert.equal(response.status, 200);
  assert.deepEqual(saveInput, {
    visitorId: "visitor-existing",
    query: " 深圳北站 ",
    categoryIds: ["food", "hotel"],
    radiusMeters: 3000,
  });
  const responseBody = await response.json();
  assert.deepEqual(responseBody, {
    item: {
      id: "history-1",
      query: " 深圳北站 ",
      categoryIds: ["food", "hotel"],
      radiusMeters: 3000,
      searchedAt: "2026-09-22T01:02:03.000Z",
    },
  });
  assert.equal(JSON.stringify(responseBody).includes("visitorId"), false);
  assert.equal(JSON.stringify(responseBody).includes("dedupeKey"), false);
  assert.equal(cookieSets.length, 0);
});

test("GET returns serialized items and strips visitor and dedupe identities", async () => {
  resetState("visitor-get");
  const response = await GET();

  assert.equal(response.status, 200);
  assert.equal(recentVisitorId, "visitor-get");
  const responseBody = await response.json();
  assert.deepEqual(responseBody, {
    items: [{
      id: "history-2",
      query: "深圳北站",
      categoryIds: ["food"],
      radiusMeters: 3000,
      searchedAt: "2026-09-22T04:05:06.000Z",
    }],
  });
  assert.equal(JSON.stringify(responseBody).includes("visitorId"), false);
  assert.equal(JSON.stringify(responseBody).includes("dedupeKey"), false);
});

test("missing visitor cookie generates and sets a secure cookie contract", async () => {
  resetState();
  const response = await POST(request({ query: "深圳北站", categoryIds: ["food"], radiusMeters: 3000 }));

  assert.equal(response.status, 200);
  assert.match(saveInput?.visitorId as string, /^[0-9a-f-]{36}$/);
  assert.equal(cookieSets.length, 1);
  assert.equal(cookieSets[0]?.name, "nearby_visitor_id");
  assert.equal(cookieSets[0]?.value, saveInput?.visitorId);
  assert.deepEqual(cookieSets[0]?.options, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
});
