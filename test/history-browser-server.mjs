// Browser acceptance fixture: real history route/service/repository and search
// validation/service, with an in-memory DB boundary and synthetic AMap data.
// Run after npm run build; no product database or provider requests are sent.
import http from "node:http";
import { AsyncLocalStorage } from "node:async_hooks";
import { mock } from "node:test";

const cookies = new AsyncLocalStorage();
const records = [];
const requests = [];
const state = { version: 1, failNextSearch: false, failCategory: null, slowLongitude: null, resolveMode: "candidates", candidateCount: 2, resultCount: 1, historyReadError: false, historyDeleteError: false, failNextPage: false };
const dbNull = Object.freeze({ kind: "database-null" });
let nextId = 0;
const visitorId = "history-browser-test";
const seed = {
  visitorId, query: "旧记录", categoryIds: ["hotel"], radiusMeters: 3000,
  confirmedLocation: null, searchedAt: new Date(),
};
for (let i = 0; i < 25; i++) records.push({ ...seed, id: `legacy-${i}`, dedupeKey: `legacy-${i}` });

mock.module("../dist/generated/prisma/client.js", {
  exports: { Prisma: { DbNull: dbNull } },
});
mock.module("../dist/src/db/prisma.js", {
  exports: { prisma: { searchHistory: {
    async upsert({ where, create, update }) {
      const { visitorId, dedupeKey } = where.visitorId_dedupeKey;
      let record = records.find((row) => row.visitorId === visitorId && row.dedupeKey === dedupeKey);
      if (record) Object.assign(record, structuredClone(update));
      else { record = { id: `saved-${++nextId}`, searchedAt: new Date(), ...structuredClone(create) }; records.push(record); }
      return structuredClone(record);
    },
    async findMany({ where, take, cursor, skip = 0 }) {
      const eligible = records.filter((row) => row.visitorId === where.visitorId && row.confirmedLocation !== null)
        .sort((a, b) => b.searchedAt - a.searchedAt || b.id.localeCompare(a.id));
      const start = cursor ? eligible.findIndex((row) => row.id === cursor.id) + skip : 0;
      return structuredClone(eligible.slice(start, start + take));
    },
    async deleteMany({ where }) {
      const index = records.findIndex((row) => row.visitorId === where.visitorId && row.id === where.id);
      if (index < 0) return { count: 0 };
      records.splice(index, 1); return { count: 1 };
    },
  } } },
});
globalThis.__historyCookies = async () => ({
  get: () => ({ value: visitorId }),
  set: (name, value, options) => cookies.getStore().push(`${name}=${value}; Path=/; SameSite=Lax${options.httpOnly ? "; HttpOnly" : ""}`),
});
globalThis.__historyNextResponse = { json: (body, init) => Response.json(body, init) };
const history = await import("../dist/app/api/history/route.js");
const { parseConfirmedSearchRequest } = await import("../dist/src/search/validation.js");
const { executeResolvedSearch } = await import("../dist/src/search/service.js");
const candidates = [
  { id: "B-test-east", name: "深圳北站东广场", placeType: "火车站", city: "深圳市", district: "龙华区", address: "验收东广场地址", location: { longitude: 114.032, latitude: 22.609 } },
  { id: "B-test-west", name: "深圳北站西广场", placeType: "火车站", city: "深圳市", district: "龙华区", address: "验收西广场地址", location: { longitude: 114.025, latitude: 22.609 } },
];

function reply(response, body, status = 200) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}
async function readBody(request) {
  const buffers = []; for await (const chunk of request) buffers.push(chunk);
  return Buffer.concat(buffers).toString();
}
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost:3107");
    if (url.pathname === "/__test/evidence") {
      reply(response, { requests, records, state, candidates }); return;
    }
    if (url.pathname === "/__test/control" && request.method === "POST") {
      Object.assign(state, JSON.parse(await readBody(request))); reply(response, state); return;
    }
    if (url.pathname.startsWith("/api/")) {
      const bodyText = await readBody(request);
      const body = bodyText ? JSON.parse(bodyText) : null;
      const log = { path: url.pathname, method: request.method, body, at: new Date().toISOString() };
      requests.push(log);
      if (url.pathname === "/api/history") {
        if ((request.method === "GET" && state.historyReadError) || (request.method === "DELETE" && state.historyDeleteError)) {
          reply(response, { error: { message: "验收：历史服务暂不可用" } }, 503); return;
        }
        const cookieHeaders = [];
        const input = new Request(url, { method: request.method, ...(bodyText ? { body: bodyText } : {}) });
        const result = await cookies.run(cookieHeaders, () => history[request.method](input));
        log.status = result.status;
        response.writeHead(result.status, { ...Object.fromEntries(result.headers), ...(cookieHeaders.length ? { "set-cookie": cookieHeaders } : {}) });
        response.end(await result.text()); return;
      }
      if (url.pathname === "/api/resolve-location") {
        if (state.resolveMode === "error") { reply(response, { error: { message: "验收：地点解析暂不可用" } }, 502); return; }
        if (state.resolveMode === "empty") { reply(response, { status: "not_found" }); return; }
        const list = Array.from({ length: state.candidateCount }, (_, index) => index < 2 ? candidates[index] : { ...candidates[0], id: "candidate-" + index, name: "验收候选地点 " + (index + 1), address: "验收长地址 " + "龙华区示例街道".repeat(5), location: { longitude: 114.03 + index / 10000, latitude: 22.609 } });
        reply(response, { status: "needs_confirmation", candidates: list }); return;
      }
      if (url.pathname === "/api/search") {
        const parsed = parseConfirmedSearchRequest(body);
        const version = state.version;
        if (state.slowLongitude === parsed.center.longitude) await new Promise((resolve) => setTimeout(resolve, 4000));
        if (state.failNextSearch) { state.failNextSearch = false; reply(response, { error: { message: "验收：周边搜索暂时失败" } }, 502); return; }
        const result = await executeResolvedSearch(parsed, {
          geocode: async () => { throw new Error("History must not geocode"); },
          searchNearby: async (center, category) => {
            if (state.failCategory === category.key || state.failCategory === "all") throw new Error("验收：单类别失败");
            return { pageNumber: 1, pageSize: 25, returnedCount: state.resultCount, mayHaveNextApiPage: state.resultCount === 25, places: Array.from({ length: state.resultCount }, (_, index) => ({
              id: `${category.key}-${center.longitude}-${index}`, parentId: null, category: category.key,
              name: `${center.longitude === candidates[1].location.longitude ? "西广场" : "东广场"}最新结果 ${version} · ${category.label} ${index + 1}`,
              longitude: center.longitude, latitude: center.latitude, address: "验收周边地址",
              distanceMeters: 100 + index * 50, distanceSource: "amap", amapDistanceMeters: 100, computedDistanceMeters: 100,
              type: null, typecode: null, cost: null, rating: null, tag: null, openTimeToday: null, openTimeWeek: null,
            })) };
          },
        }, async () => {});
        log.resultVersion = version; reply(response, result); return;
      }
      if (url.pathname === "/api/search/page") {
        if (state.failNextPage) { state.failNextPage = false; reply(response, { error: { message: "验收：分页失败" } }, 502); return; }
        const category = body.categoryId;
        const places = Array.from({ length: 3 }, (_, index) => ({ id: category + "-page2-" + index, name: "第二页地点 " + (index + 1), parentId: null, category, longitude: body.center.longitude, latitude: body.center.latitude, address: "验收第二页地址", distanceMeters: 1500 + index * 50, distanceSource: "amap", amapDistanceMeters: 1500, computedDistanceMeters: 1500, type: null, typecode: null, cost: null, rating: null, tag: null, openTimeToday: null, openTimeWeek: null }));
        reply(response, { categoryId: category, page: { pageNumber: 2, pageSize: 25, returnedCount: 3, mayHaveNextApiPage: false, places } }); return;
      }
      reply(response, { error: { message: "Unexpected test API" } }, 400); return;
    }
    // Serve the actual production-built Next UI and assets, intercept APIs only.
    const upstream = http.request({ hostname: "127.0.0.1", port: Number(process.env.UI_UPSTREAM_PORT ?? 3108), path: request.url, method: request.method, headers: { ...request.headers, host: "localhost:3108" } }, (result) => {
      response.writeHead(result.statusCode ?? 502, result.headers); result.pipe(response);
    });
    upstream.on("error", (error) => reply(response, { error: error.message }, 502));
    request.pipe(upstream);
  } catch (error) { reply(response, { error: error.message }, 500); }
});
server.listen(Number(process.env.UI_FIXTURE_PORT ?? 3107), "127.0.0.1", () => console.log("Isolated history browser fixture ready"));
