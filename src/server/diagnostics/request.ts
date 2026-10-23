import "server-only";
import { randomUUID } from "node:crypto";
import type { Diagnostics } from "../../diagnostics.js";
import { SESSION_ID_PATTERN } from "./logger.js";
import { createDiagnostics } from "./timer.js";

/** No response mutation, body inspection, global context or framework middleware. */
export function withDiagnostics(route: string, handler: (request: Request, diagnostics: Diagnostics) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    const suppliedSession = request.headers.get("x-diagnostic-session-id");
    const diagnostics = createDiagnostics({
      requestId: randomUUID(), route,
      ...(suppliedSession && SESSION_ID_PATTERN.test(suppliedSession) ? { diagnosticSessionId: suppliedSession.toLowerCase() } : {}),
    });
    const start = performance.now();
    diagnostics.event("http.request.started", "request");
    try {
      const response = await handler(request, diagnostics);
      // Normal returned 4xx/5xx are still completed requests, with their actual status.
      if (response.status >= 500 && !diagnostics.hasErrors()) diagnostics.error(response, "request", true, { status: response.status, durationMs: performance.now() - start });
      diagnostics.event("http.request.completed", "request", { status: response.status, durationMs: performance.now() - start });
      return response;
    } catch (error) {
      diagnostics.error(error, "request", false, { durationMs: performance.now() - start });
      diagnostics.event("http.request.completed", "request", { status: 500, durationMs: performance.now() - start });
      throw error;
    }
  };
}
