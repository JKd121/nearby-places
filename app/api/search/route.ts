import { createServerAmapClient } from "../../../src/server/amap";
import { jsonError, mapServerError } from "../../../src/server/http";
import { executeResolvedSearch } from "../../../src/search/service";
import { parseConfirmedSearchRequest, SearchRequestValidationError } from "../../../src/search/validation";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return jsonError("请求必须是有效 JSON", 400); }
  let parsed;
  try { parsed = parseConfirmedSearchRequest(body); }
  catch (error) {
    if (error instanceof SearchRequestValidationError) return jsonError(error.message, 400);
    return jsonError("请求校验失败", 400);
  }
  try { return Response.json(await executeResolvedSearch(parsed, createServerAmapClient())); }
  catch (error) { return mapServerError(error, "周边搜索"); }
}
