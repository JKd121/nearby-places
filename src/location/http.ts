import { AmapApiError } from "../amap/client.js";

/** Keep provider diagnostics server-side; the resolver browser contract is generic. */
export function mapLocationResolverError(error: unknown): Response {
  const status = error instanceof AmapApiError ? 502 : 500;
  return Response.json({ error: { message: "服务暂不可用，请稍后再试" } }, { status });
}
