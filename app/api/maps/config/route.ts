import { resolveRequestIdentity } from "../../../../src/identity/service.js";
import { mapServerError, jsonError } from "../../../../src/server/http.js";
import { mapConfiguration, MAP_PROXY_PREFIX } from "../../../../src/server/map-config.js";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    await resolveRequestIdentity(request);
    const config = mapConfiguration();
    if (!config) return jsonError("地图配置暂未就绪，搜索结果仍可正常查看", 503, "MAP_UNAVAILABLE");
    return Response.json({ key: config.key, serviceHost: MAP_PROXY_PREFIX }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return mapServerError(error); }
}
