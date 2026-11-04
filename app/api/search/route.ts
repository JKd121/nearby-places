import { createServerAmapClient } from "../../../src/server/amap.js";
import { jsonError } from "../../../src/server/http.js";
import { executeResolvedSearch, searchDeadlineResponse, type SearchSnapshot } from "../../../src/search/service.js";
import type { ConfirmedSearchRequest } from "../../../src/search/contracts.js";
import { parseConfirmedSearchRequest, SearchRequestValidationError } from "../../../src/search/validation.js";
import { readRequestJson, withRequestLifecycle } from "../../../src/server/request-lifecycle.js";
import { throwIfAborted } from "../../../src/amap/request-context.js";
import { searchStreamResponse } from "../../../src/server/search-stream.js";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get("accept")?.split(",").some(value => value.trim() === "application/x-ndjson")) return searchStreamResponse(request);
  let parsed: ConfirmedSearchRequest | undefined;
  let completed: SearchSnapshot = { results: [], active: [], pending: [] };
  return withRequestLifecycle(request, async (context, policy) => {
    let body: unknown;
    try { body = await readRequestJson(request, context, policy.maxRequestBytes); } catch { throwIfAborted(context.signal); return jsonError("请求必须是有效 JSON", 400); }
    try { parsed = parseConfirmedSearchRequest(body); }
    catch (error) {
      if (error instanceof SearchRequestValidationError) return jsonError(error.message, 400);
      return jsonError("请求校验失败", 400);
    }
    return Response.json(await executeResolvedSearch(parsed, createServerAmapClient(undefined, context, policy), { context, onSnapshot: snapshot => { completed = snapshot; } }));
  }, () => {
    const partial = parsed && searchDeadlineResponse(parsed, completed);
    return partial ? Response.json(partial) : undefined;
  });
}
