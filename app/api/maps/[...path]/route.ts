import { resolveRequestIdentity } from "../../../../src/identity/service.js";
import { requireRate } from "../../../../src/identity/rate.js";
import { fingerprint } from "../../../../src/identity/security.js";
import { mapServerError, jsonError } from "../../../../src/server/http.js";
import { mapConfiguration, mapProxyTarget } from "../../../../src/server/map-config.js";
import { requestMapAsset } from "../../../../src/amap/transport.js";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    if (["cross-site", "none"].includes(request.headers.get("sec-fetch-site") ?? "")) return jsonError("请求来源校验失败", 403);
    const config = mapConfiguration();
    if (!config) return jsonError("地图配置暂未就绪", 503, "MAP_UNAVAILABLE");
    const target = mapProxyTarget((await context.params).path, new URL(request.url).searchParams, config);
    if (!target) return jsonError("地图请求无效", 400, "INVALID_MAP_REQUEST");
    const identity = await resolveRequestIdentity(request);
    await requireRate("map-assets:" + fingerprint(identity.sessionId, "map"), 60, 120);
    try { return await requestMapAsset(target, request.signal); }
    catch { return jsonError("地图资源暂不可用，请重试", 502, "MAP_UNAVAILABLE"); }
  } catch (error) { return mapServerError(error); }
}
