import { AmapApiError } from "../amap/errors.js";
import { AdmissionError } from "../admission/errors.js";

export type ErrorAction = "recover" | "stop" | "abort" | "fatal";
export type PublicSearchErrorCode = "ADMISSION_WAIT_EXCEEDED" | "ADMISSION_UNAVAILABLE" | "DAILY_BUDGET_EXHAUSTED" | "MONTHLY_BUDGET_EXHAUSTED" | "SERVICE_UNAVAILABLE" | "REQUEST_DEADLINE_EXCEEDED";
export interface FailureClassification {
  nature: "timeout" | "cancelled" | "quota" | "database" | "authentication" | "provider" | "invalid-request" | "internal";
  scope: "call" | "category" | "shared-resource" | "request";
  resource?: "admission" | "amap-credential";
}

/** Facts about the failure; the caller owns scheduling and available capabilities. */
export function classifyFailure(error: unknown): FailureClassification {
  if (!(error instanceof AmapApiError)) return { nature: "internal", scope: "request" };
  switch (error.code) {
    case "REQUEST_CANCELLED": return { nature: "cancelled", scope: "request" };
    case "REQUEST_DEADLINE_EXCEEDED": return { nature: "timeout", scope: "request" };
    case "REQUEST_BODY_TOO_LARGE": return { nature: "invalid-request", scope: "request" };
    case "ADMISSION_WAIT_EXCEEDED": return { nature: "timeout", scope: "category" };
    case "ADMISSION_UNAVAILABLE": return { nature: "database", scope: error instanceof AdmissionError && error.recovery === "next-category" ? "category" : "shared-resource", resource: "admission" };
    case "DAILY_BUDGET_EXHAUSTED": case "MONTHLY_BUDGET_EXHAUSTED": return { nature: "quota", scope: "shared-resource", resource: "admission" };
    case "UPSTREAM_AUTH_FAILED": return { nature: "authentication", scope: "shared-resource", resource: "amap-credential" };
    case "UPSTREAM_HTTP":
      return error.upstreamStatus === 401 || error.upstreamStatus === 403
        ? { nature: "authentication", scope: "shared-resource", resource: "amap-credential" } : { nature: "provider", scope: "call" };
    case "UPSTREAM_TIMEOUT": return { nature: "timeout", scope: "call" };
    // Official Web Service error table: 10003 is a daily quota exhausted for the key.
    // https://lbs.amap.com/api/webservice/guide/tools/info
    case "UPSTREAM_BUSINESS": return error.infocode === "10003"
      ? { nature: "quota", scope: "shared-resource", resource: "amap-credential" } : { nature: "provider", scope: "call" };
    case "UPSTREAM_NETWORK": case "UPSTREAM_INVALID_JSON": case "UPSTREAM_INVALID_PAYLOAD": case "UPSTREAM_BODY_TOO_LARGE": return { nature: "provider", scope: "call" };
    default: return { nature: "internal", scope: "request" };
  }
}

/** Classify only known typed errors; never use provider or exception text. */
export function classifyError(error: unknown): ErrorAction {
  const failure = classifyFailure(error);
  if (failure.nature === "internal") return "fatal";
  if (failure.scope === "request") return "abort";
  return failure.scope === "shared-resource" ? "stop" : "recover";
}

export function publicStopCode(error: AmapApiError): PublicSearchErrorCode {
  if (error.code === "UPSTREAM_BUSINESS" && error.infocode === "10003") return "DAILY_BUDGET_EXHAUSTED";
  switch (error.code) {
    case "REQUEST_DEADLINE_EXCEEDED": case "ADMISSION_WAIT_EXCEEDED": case "ADMISSION_UNAVAILABLE": case "DAILY_BUDGET_EXHAUSTED": case "MONTHLY_BUDGET_EXHAUSTED": return error.code;
    default: return "SERVICE_UNAVAILABLE";
  }
}

export function publicSearchErrorMessage(code: PublicSearchErrorCode): string {
  switch (code) {
    case "REQUEST_DEADLINE_EXCEEDED": return "搜索时间已用完，请缩小范围或减少类别后重试";
    case "ADMISSION_WAIT_EXCEEDED": return "服务繁忙，等待已结束，请稍后再试";
    case "DAILY_BUDGET_EXHAUSTED": return "今日服务额度已用完，请明日再试";
    case "MONTHLY_BUDGET_EXHAUSTED": return "本月服务额度已用完，请下月再试";
    default: return "服务暂不可用，请稍后再试";
  }
}
