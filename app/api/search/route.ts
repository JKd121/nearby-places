import { withDiagnostics } from "../../../src/server/diagnostics/request.js";
import { createServerAmapClient } from "../../../src/server/amap.js";
import { jsonError, mapServerError } from "../../../src/server/http.js";
import { executeResolvedSearch } from "../../../src/search/service.js";
import { parseConfirmedSearchRequest, SearchRequestValidationError } from "../../../src/search/validation.js";

export const runtime = "nodejs";

export const POST = withDiagnostics("/api/search", async (request, diagnostics): Promise<Response> => {
  let body: unknown;
  try { body = await diagnostics.measure("request.json", () => request.json()); } catch (error) { diagnostics.error(error, "request.json", true, { status: 400 }); return jsonError("请求必须是有效 JSON", 400); }
  let parsed;
  try { parsed = diagnostics.measureSync("request.validation", () => parseConfirmedSearchRequest(body)); }
  catch (error) {
    diagnostics.error(error, "request.validation", true, { status: 400 });
    if (error instanceof SearchRequestValidationError) return jsonError(error.message, 400);
    return jsonError("请求校验失败", 400);
  }
  try { return Response.json(await executeResolvedSearch(parsed, createServerAmapClient(diagnostics), undefined, diagnostics)); }
  catch (error) { diagnostics.error(error, "request", true); return mapServerError(error, "周边搜索"); }
});
