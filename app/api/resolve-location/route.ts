import { resolveAmapAccess } from "../../../src/server/amap-access.js";
import { createServerLocationResolverProvider } from "../../../src/server/amap.js";
import { jsonError } from "../../../src/server/http.js";
import { resolveLocation } from "../../../src/location/resolver.js";
import { readRequestJson, withRequestLifecycle } from "../../../src/server/request-lifecycle.js";
import { throwIfAborted } from "../../../src/amap/request-context.js";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return withRequestLifecycle(request, async (context, policy) => {
    let body: unknown;
    try { body = await readRequestJson(request, context, policy.maxRequestBytes); } catch { throwIfAborted(context.signal); return jsonError("请求必须是有效 JSON", 400); }
    if (typeof body !== "object" || body === null || Array.isArray(body)) return jsonError("请求必须是对象", 400);
    const record = body as Record<string, unknown>;
    const unknownFields = Object.keys(record).filter((field) => field !== "query");
    if (unknownFields.length > 0) return jsonError(`不支持的请求字段：${unknownFields.join(", ")}`, 400);
    if (typeof record.query !== "string" || record.query.trim().length < 1 || record.query.trim().length > 200) return jsonError("地点名称长度必须为 1-200 个字符", 400);
    const resolution = await resolveLocation(record.query.trim(), createServerLocationResolverProvider(undefined, context, policy, await resolveAmapAccess(request, policy.upstreamTimeoutMs)), undefined, context);
    return resolution.status === "not_found" ? Response.json({ status: "not_found" }) : Response.json(resolution);
  });
}
