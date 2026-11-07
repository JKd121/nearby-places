export type AmapErrorCode = "IDENTITY_REQUIRED" | "CREDENTIAL_REQUIRED" | "CREDENTIAL_INVALID" | "UPSTREAM_QUOTA_EXHAUSTED" | "UPSTREAM_RATE_LIMITED" | "GUEST_DAILY_EXHAUSTED" | "UPSTREAM_NETWORK" | "UPSTREAM_HTTP" | "UPSTREAM_INVALID_JSON" | "UPSTREAM_INVALID_PAYLOAD" | "UPSTREAM_BUSINESS" | "UPSTREAM_AUTH_FAILED" | "UPSTREAM_BODY_TOO_LARGE" | "UPSTREAM_TIMEOUT" | "REQUEST_CANCELLED" | "REQUEST_DEADLINE_EXCEEDED" | "REQUEST_BODY_TOO_LARGE" | "ALL_CATEGORIES_FAILED" | "GEOCODE_NOT_FOUND" | "DAILY_BUDGET_EXHAUSTED" | "MONTHLY_BUDGET_EXHAUSTED" | "ADMISSION_WAIT_EXCEEDED" | "ADMISSION_UNAVAILABLE";

/** Never put URLs, response bodies or arbitrary upstream messages in an Error. */
export class AmapApiError extends Error {
  constructor(message: string, readonly info: string | null = null, readonly infocode: string | null = null,
    readonly code: AmapErrorCode = "UPSTREAM_BUSINESS", readonly upstreamStatus: number | null = null) {
    super(message);
    this.name = "AmapApiError";
  }
}

export class RequestTerminatedError extends AmapApiError {
  constructor(code: "REQUEST_CANCELLED" | "REQUEST_DEADLINE_EXCEEDED" | "UPSTREAM_TIMEOUT") {
    super("Request terminated", null, null, code);
    this.name = "RequestTerminatedError";
  }
}

export class RequestBodyTooLargeError extends AmapApiError {
  constructor() {
    super("Request body exceeded size limit", null, null, "REQUEST_BODY_TOO_LARGE");
    this.name = "RequestBodyTooLargeError";
  }
}

/** Lifecycle cleanup after an error escapes a route; category decisions use classifyError. */
export function isRequestTerminal(error: unknown): error is AmapApiError {
  return error instanceof AmapApiError && ["REQUEST_CANCELLED", "REQUEST_DEADLINE_EXCEEDED", "REQUEST_BODY_TOO_LARGE", "UPSTREAM_TIMEOUT", "UPSTREAM_AUTH_FAILED", "DAILY_BUDGET_EXHAUSTED", "MONTHLY_BUDGET_EXHAUSTED", "ADMISSION_WAIT_EXCEEDED", "ADMISSION_UNAVAILABLE"].includes(error.code);
}

export function safeErrorDiagnostic(error: unknown) {
  return error instanceof AmapApiError
    ? { code: error.code, upstreamStatus: error.upstreamStatus, infocode: error.infocode && /^\d{5,6}$/.test(error.infocode) ? error.infocode : null }
    : { code: "INTERNAL_ERROR", upstreamStatus: null, infocode: null };
}
