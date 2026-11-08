export const MAP_PROXY_PREFIX = "/api/maps/_AMapService";
const PATHS = new Set(["/v4/map/styles", "/v3/log/init"]);
const QUERY_KEYS = new Set(["key", "jscode", "callback", "v", "version", "styleid", "style", "ispublic", "output", "logversion", "sdkversion", "platform", "appname", "csid", "channel", "s", "ts",
  "eventId", "product", "t", "label", "value", "resolution", "mob", "vt", "dpr", "scale"]);

export function mapConfiguration(env: Record<string, string | undefined> = process.env) {
  const key = env.AMAP_JS_API_KEY?.trim(), securityCode = env.AMAP_JS_SECURITY_CODE?.trim();
  if (!key || !/^[a-f0-9]{32}$/i.test(key) || !securityCode || !/^[a-f0-9]{32}$/i.test(securityCode)) return null;
  return { key, securityCode };
}

/** Fixed paths and bounded query fields. Browser-provided credentials are replaced. */
export function mapProxyTarget(path: readonly string[], query: URLSearchParams, config: { key: string; securityCode: string }): URL | null {
  if (path[0] !== "_AMapService") return null;
  const endpoint = "/" + path.slice(1).join("/");
  if (!PATHS.has(endpoint) || query.toString().length > 4096) return null;
  for (const [key, value] of query) {
    if (!QUERY_KEYS.has(key) || query.getAll(key).length !== 1 || value.length > 512) return null;
    if (key === "callback" && !/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(value)) return null;
  }
  const target = new URL(endpoint, "https://restapi.amap.com");
  target.search = query.toString(); target.searchParams.set("key", config.key); target.searchParams.set("jscode", config.securityCode);
  return target;
}
