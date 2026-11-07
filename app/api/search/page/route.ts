import { resolveAmapAccess } from "../../../../src/server/amap-access.js";
import { executeSecondPageSearch } from "../../../../src/search/service.js";
import { parseSearchSecondPageRequest, SearchRequestValidationError } from "../../../../src/search/validation.js";
import { createServerAmapClient } from "../../../../src/server/amap.js";
import { jsonError } from "../../../../src/server/http.js";
import { readRequestJson, withRequestLifecycle } from "../../../../src/server/request-lifecycle.js";
import { throwIfAborted } from "../../../../src/amap/request-context.js";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return withRequestLifecycle(request, async (context, policy) => {
    let body: unknown;
    try { body = await readRequestJson(request, context, policy.maxRequestBytes); }
    catch { throwIfAborted(context.signal); return jsonError("请求必须是有效 JSON", 400); }

    let parsed;
    try { parsed = parseSearchSecondPageRequest(body); }
    catch (error) {
      if (error instanceof SearchRequestValidationError) return jsonError(error.message, 400);
      return jsonError("请求校验失败", 400);
    }

    return Response.json(await executeSecondPageSearch(parsed, createServerAmapClient(undefined, context, policy, await resolveAmapAccess(request, policy.upstreamTimeoutMs)), context));
  });
}
