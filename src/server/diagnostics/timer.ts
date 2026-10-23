import "server-only";
import type { Diagnostics, DiagnosticStage, DiagnosticFields, DiagnosticErrorType } from "../../diagnostics.js";
import { safeCode, writeLog, type LogContext, type SafeError } from "./logger.js";

type Failure = { stage?: DiagnosticStage; durationMs?: number; error?: SafeError };
export function createDiagnostics(context: LogContext): Diagnostics & { hasErrors(): boolean } {
  // Request-local state, including deduplication. Never associate unrelated requests.
  const failures = new Map<unknown, Failure>();
  const reported = new Set<unknown>();
  function failed(error: unknown, stage: DiagnosticStage, durationMs: number): void {
    const previous = failures.get(error) ?? {};
    failures.set(error, { stage, durationMs, ...previous });
  }
  const diagnostics: Diagnostics & { hasErrors(): boolean } = {
    hasErrors() { return reported.size > 0; },
    async measure(stage, operation, fields = {}) {
      const enabled = process.env.PERF_LOG_ENABLED === "true";
      const start = performance.now();
      try {
        const result = await operation();
        if (enabled) writeLog(context, "phase.completed", stage, { ...fields, durationMs: performance.now() - start });
        return result;
      } catch (error) {
        const durationMs = performance.now() - start;
        failed(error, stage, durationMs);
        if (enabled) writeLog(context, "phase.failed", stage, { ...fields, durationMs });
        throw error;
      }
    },
    measureSync(stage, operation, fields = {}) {
      const start = performance.now();
      try {
        const result = operation();
        writeLog(context, "phase.completed", stage, { ...fields, durationMs: performance.now() - start });
        return result;
      } catch (error) {
        const durationMs = performance.now() - start;
        failed(error, stage, durationMs);
        writeLog(context, "phase.failed", stage, { ...fields, durationMs });
        throw error;
      }
    },
    event(event, stage, fields) { writeLog(context, event, stage, fields); },
    annotate(error, type, code) {
      const previous = failures.get(error) ?? {};
      failures.set(error, { ...previous, error: { type, code: safeCode(code) } });
    },
    error(error, stage, handled, fields = {}) {
      if (reported.has(error)) return;
      reported.add(error);
      const failure = failures.get(error);
      let type: DiagnosticErrorType = "internal";
      if (failure?.stage === "amap.fetch" || failure?.stage === "amap.read") type = "network";
      if (failure?.stage === "request.json") type = "invalid_json";
      if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) type = "timeout";
      writeLog(context, "diagnostics.error", failure?.stage ?? stage,
        { ...fields, ...(failure?.durationMs === undefined ? {} : { durationMs: failure.durationMs }) },
        failure?.error ?? { type, code: "UNEXPECTED_ERROR" }, handled);
    },
  };
  return diagnostics;
}
