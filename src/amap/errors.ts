export type AmapErrorCode = "UPSTREAM_NETWORK" | "UPSTREAM_HTTP" | "UPSTREAM_INVALID_JSON" | "UPSTREAM_INVALID_PAYLOAD" | "UPSTREAM_BUSINESS" | "UPSTREAM_AUTH_FAILED" | "UPSTREAM_BODY_TOO_LARGE" | "UPSTREAM_TIMEOUT" | "REQUEST_CANCELLED" | "REQUEST_DEADLINE_EXCEEDED" | "REQUEST_BODY_TOO_LARGE" | "ALL_CATEGORIES_FAILED" | "GEOCODE_NOT_FOUND";

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

export function isRequestTerminal(error: unknown): error is AmapApiError {
  return error instanceof AmapApiError && ["REQUEST_CANCELLED", "REQUEST_DEADLINE_EXCEEDED", "REQUEST_BODY_TOO_LARGE", "UPSTREAM_TIMEOUT", "UPSTREAM_AUTH_FAILED"].includes(error.code);
}

export function safeErrorDiagnostic(error: unknown) {
  return error instanceof AmapApiError
    ? { code: error.code, upstreamStatus: error.upstreamStatus, infocode: error.infocode && /^\d{5,6}$/.test(error.infocode) ? error.infocode : null }
    : { code: "INTERNAL_ERROR", upstreamStatus: null, infocode: null };
}
