import { AmapApiError } from "../amap/errors.js";

export type ErrorAction = "recover" | "stop" | "abort" | "fatal";
export type PublicSearchErrorCode = "ADMISSION_WAIT_EXCEEDED" | "ADMISSION_UNAVAILABLE" | "DAILY_BUDGET_EXHAUSTED" | "MONTHLY_BUDGET_EXHAUSTED" | "SERVICE_UNAVAILABLE";

/** Classify only known typed errors; never use provider or exception text. */
export function classifyError(error: unknown): ErrorAction {
  if (!(error instanceof AmapApiError)) return "fatal";
  switch (error.code) {
    case "REQUEST_CANCELLED": case "REQUEST_DEADLINE_EXCEEDED": case "REQUEST_BODY_TOO_LARGE": return "abort";
    case "ADMISSION_WAIT_EXCEEDED": case "ADMISSION_UNAVAILABLE": case "DAILY_BUDGET_EXHAUSTED": case "MONTHLY_BUDGET_EXHAUSTED": case "UPSTREAM_AUTH_FAILED": return "stop";
    case "UPSTREAM_HTTP": return error.upstreamStatus === 401 || error.upstreamStatus === 403 ? "stop" : "recover";
    case "UPSTREAM_NETWORK": case "UPSTREAM_TIMEOUT": case "UPSTREAM_BUSINESS": case "UPSTREAM_INVALID_JSON": case "UPSTREAM_INVALID_PAYLOAD": case "UPSTREAM_BODY_TOO_LARGE": return "recover";
    default: return "fatal";
  }
}

export function publicStopCode(error: AmapApiError): PublicSearchErrorCode {
  switch (error.code) {
    case "ADMISSION_WAIT_EXCEEDED": case "ADMISSION_UNAVAILABLE": case "DAILY_BUDGET_EXHAUSTED": case "MONTHLY_BUDGET_EXHAUSTED": return error.code;
    default: return "SERVICE_UNAVAILABLE";
  }
}

export function publicSearchErrorMessage(code: PublicSearchErrorCode): string {
  switch (code) {
    case "ADMISSION_WAIT_EXCEEDED": return "服务繁忙，等待已结束，请稍后再试";
    case "DAILY_BUDGET_EXHAUSTED": return "今日服务额度已用完，请明日再试";
    case "MONTHLY_BUDGET_EXHAUSTED": return "本月服务额度已用完，请下月再试";
    default: return "服务暂不可用，请稍后再试";
  }
}
