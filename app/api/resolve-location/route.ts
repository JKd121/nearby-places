import { withDiagnostics } from "../../../src/server/diagnostics/request.js";
import { createServerLocationResolverProvider } from "../../../src/server/amap.js";
import { jsonError } from "../../../src/server/http.js";
import { mapLocationResolverError } from "../../../src/location/http.js";
import { resolveLocation } from "../../../src/location/resolver.js";

export const runtime = "nodejs";

export const POST = withDiagnostics("/api/resolve-location", async (request, diagnostics): Promise<Response> => {
  let body: unknown;
  try { body = await diagnostics.measure("request.json", () => request.json()); } catch (error) { diagnostics.error(error, "request.json", true, { status: 400 }); return jsonError("请求必须是有效 JSON", 400); }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return jsonError("请求必须是对象", 400);
  const record = body as Record<string, unknown>;
  const unknownFields = Object.keys(record).filter((field) => field !== "query");
  if (unknownFields.length > 0) return jsonError(`不支持的请求字段：${unknownFields.join(", ")}`, 400);
  if (typeof record.query !== "string" || record.query.trim().length < 1 || record.query.trim().length > 200) return jsonError("地点名称长度必须为 1-200 个字符", 400);
  try {
    const resolution = await diagnostics.measure("location.resolve", () => resolveLocation((record.query as string).trim(), createServerLocationResolverProvider(diagnostics), diagnostics));
    diagnostics.event("location.resolve.completed", "location.resolve", { outcome: resolution.status });
    return resolution.status === "not_found" ? Response.json({ status: "not_found" }) : Response.json(resolution);
  }
  catch (error) { diagnostics.error(error, "location.resolve", true); return mapLocationResolverError(error); }
});
