import { AmapApiError } from "../../../../src/amap/client.js";
import { executeSecondPageSearch } from "../../../../src/search/service.js";
import { parseSearchSecondPageRequest, SearchRequestValidationError } from "../../../../src/search/validation.js";
import { createServerAmapClient } from "../../../../src/server/amap.js";
import { jsonError } from "../../../../src/server/http.js";

export const runtime = "nodejs";

function safeServerError(error: unknown): Response {
  return Response.json(
    { error: { message: "服务暂不可用，请稍后再试" } },
    { status: error instanceof AmapApiError ? 502 : 500 },
  );
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return jsonError("请求必须是有效 JSON", 400); }

  let parsed;
  try { parsed = parseSearchSecondPageRequest(body); }
  catch (error) {
    if (error instanceof SearchRequestValidationError) return jsonError(error.message, 400);
    return jsonError("请求校验失败", 400);
  }

  try { return Response.json(await executeSecondPageSearch(parsed, createServerAmapClient())); }
  catch (error) { return safeServerError(error); }
}
