import { AmapApiError } from "../amap/client.js";
import { MissingServerKeyError } from "./amap.js";

export function jsonError(message: string, status: number, details: { info?: string | null; infocode?: string | null } = {}): Response {
  return Response.json({ error: { message, info: details.info ?? null, infocode: details.infocode ?? null } }, { status });
}

export function mapServerError(error: unknown, operation: string): Response {
  if (error instanceof MissingServerKeyError) return jsonError("服务暂不可用，请稍后再试", 500);
  if (error instanceof AmapApiError) return jsonError(`${operation}失败`, 502, { info: error.info, infocode: error.infocode });
  return jsonError("服务暂不可用，请稍后再试", 500);
}
