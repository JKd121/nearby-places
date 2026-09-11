import { createServerLocationResolverProvider } from "../../../src/server/amap";
import { jsonError } from "../../../src/server/http";
import { mapLocationResolverError } from "../../../src/location/http";
import { resolveLocation } from "../../../src/location/resolver";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return jsonError("请求必须是有效 JSON", 400); }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return jsonError("请求必须是对象", 400);
  const record = body as Record<string, unknown>;
  const unknownFields = Object.keys(record).filter((field) => field !== "query");
  if (unknownFields.length > 0) return jsonError(`不支持的请求字段：${unknownFields.join(", ")}`, 400);
  if (typeof record.query !== "string" || record.query.trim().length < 1 || record.query.trim().length > 200) return jsonError("地点名称长度必须为 1-200 个字符", 400);
  try {
    const resolution = await resolveLocation(record.query.trim(), createServerLocationResolverProvider());
    return resolution.status === "not_found" ? Response.json({ status: "not_found" }) : Response.json(resolution);
  }
  catch (error) { return mapLocationResolverError(error); }
}
