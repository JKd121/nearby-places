import { AmapApiError, safeErrorDiagnostic } from "../amap/errors.js";
import { MissingServerKeyError } from "./amap.js";
import { RequestPolicyError } from "./request-policy.js";
import { AdmissionError } from "../admission/errors.js";
import { publicSearchErrorMessage, publicStopCode } from "../errors/classify.js";

export function jsonError(message: string, status: number, code?: string): Response {
  return Response.json({ error: { message, ...(code ? { code } : {}) } }, { status });
}

export function mapServerError(error: unknown, _operation?: string): Response {
  // Only a fixed field allowlist is logged. Never log the original Error/cause.
  console.error("request.failed", safeErrorDiagnostic(error));
  if (error instanceof AdmissionError) {
    const message = publicSearchErrorMessage(publicStopCode(error));
    return Response.json({ error: { message, code: error.code, ...(error.retryAt ? { retryAt: error.retryAt } : {}) } },
      { status: error.code === "ADMISSION_UNAVAILABLE" ? 503 : 429 });
  }
  if (error instanceof RequestPolicyError) return jsonError("服务暂不可用，请稍后再试", 503, "SERVICE_UNAVAILABLE");
  if (error instanceof MissingServerKeyError) return jsonError("服务暂不可用，请稍后再试", 500);
  if (error instanceof AmapApiError) {
    if (error.code === "ALL_CATEGORIES_FAILED") return jsonError("本次搜索的类别均未成功，请稍后重试", 502, error.code);
    if (error.code === "REQUEST_BODY_TOO_LARGE") return jsonError("请求内容过大，请缩短后重试", 413, error.code);
    if (error.code === "REQUEST_CANCELLED") return jsonError("请求已取消", 499, error.code);
    if (error.code === "UPSTREAM_TIMEOUT" || error.code === "REQUEST_DEADLINE_EXCEEDED") return jsonError("请求超时，请稍后再试", 504, error.code);
    if (error.code === "UPSTREAM_AUTH_FAILED" || (error.code === "UPSTREAM_HTTP" && (error.upstreamStatus === 401 || error.upstreamStatus === 403))) return jsonError("服务暂不可用，请稍后再试", 503, "SERVICE_UNAVAILABLE");
    return jsonError("服务暂不可用，请稍后再试", 502);
  }
  return jsonError("服务暂不可用，请稍后再试", 500);
}
