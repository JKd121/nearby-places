import assert from "node:assert/strict";
import test from "node:test";

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
};

const globals = globalThis as typeof globalThis & {
  __historyCookies: () => Promise<typeof cookieStore>;
  __historyNextResponse: { json: (body: unknown, init?: ResponseInit) => Response };
  __historyService: typeof serviceMock;
};
globals.__historyCookies = async () => cookieStore;
globals.__historyNextResponse = { json: (body, init) => Response.json(body, init) };
globals.__historyService = serviceMock;

const historyRouteModule = "../app/api/history/route.js";
const { GET, POST } = await import(historyRouteModule);

const routeUrl = "http://localhost/api/history";

function request(body: string | object): Request {
  return new Request(routeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function resetState(visitorId?: string): void {
  cookieValue = visitorId;
  cookieSets.length = 0;
  saveInput = undefined;
  recentVisitorId = undefined;
}

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
