import { AmapApiError } from "../amap/errors.js";

export type AdmissionCode = "DAILY_BUDGET_EXHAUSTED" | "MONTHLY_BUDGET_EXHAUSTED" | "ADMISSION_WAIT_EXCEEDED" | "ADMISSION_UNAVAILABLE";
export class AdmissionError extends AmapApiError {
  constructor(code: AdmissionCode, readonly retryAt?: string, readonly recovery: "next-category" | "stop" = code === "ADMISSION_WAIT_EXCEEDED" ? "next-category" : "stop",
    readonly connection: "healthy" | "replace" | "unknown" = "unknown") {
    super("Upstream admission refused", null, null, code);
    this.name = "AdmissionError";
  }
}

export function transientAdmission(connection: "healthy" | "replace" | "unknown" = "unknown") {
  return new AdmissionError("ADMISSION_UNAVAILABLE", undefined, "next-category", connection);
}

export function isTransientDatabaseError(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null;
  const code = typeof e?.code === "string" ? e.code : "";
  return /^(?:08|53)[0-9A-Z]{3}$/.test(code) || ["57014", "55P03", "40P01", "40001", "57P01", "57P02", "57P03", "25P03",
    "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE", "ENOTFOUND", "EAI_AGAIN"].includes(code) ||
    ["Query read timeout", "Connection terminated", "Connection terminated unexpectedly", "Connection terminated due to connection timeout", "timeout exceeded when trying to connect"].includes(String(e?.message));
}

const LOGGED = Symbol.for("nearby.admission.failure.logged.v1");
export function logAdmissionFailure(error: AmapApiError, fields: Record<string, unknown>) {
  try {
    if (LOGGED in error) return;
    Object.defineProperty(error, LOGGED, { value: true });
    console.error("admission.failed", fields);
  } catch { /* Logging must retain the original failure. */ }
}
