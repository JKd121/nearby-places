import "server-only";
import type { DiagnosticEvent, DiagnosticFields, DiagnosticStage, DiagnosticErrorType } from "../../diagnostics.js";

export const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const events = new Set<DiagnosticEvent>(["http.request.started", "http.request.completed", "phase.completed", "phase.failed", "diagnostics.error", "search.completed", "location.resolve.completed", "search.category.completed"]);
const stages = new Set<DiagnosticStage>(["request", "request.json", "request.validation", "location.resolve", "location.geocode", "location.poi", "location.normalize", "search.category", "search.inter_category_wait", "amap.fetch", "amap.read", "amap.json", "amap.validate", "amap.transform"]);
const categories = new Set(["hotel", "mall", "hotpot", "bakery", "dessert", "ktv", "billiards", "gym", "bus", "subway"]);
const outcomes = new Set(["success", "partial success", "error", "empty", "confirmed", "needs_confirmation", "not_found"]);
const errorTypes = new Set<DiagnosticErrorType>(["network", "timeout", "upstream_http", "upstream_business", "invalid_json", "invalid_payload", "internal"]);
export interface LogContext { requestId: string; diagnosticSessionId?: string; route: string; }
export interface SafeError { type: DiagnosticErrorType; code: string; }
export function safeCode(value: unknown): string {
  return typeof value === "string" && /^\d{3,6}$/.test(value) ? value : "UNEXPECTED_ERROR";
}
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0; }

/** Construct a fresh allowlisted object. Never serialize arbitrary input/error/env objects. */
export function writeLog(context: LogContext, event: DiagnosticEvent, stage: DiagnosticStage, fields: DiagnosticFields = {}, error?: SafeError, handled?: boolean): void {
  try {
    if (!error && process.env.PERF_LOG_ENABLED !== "true") return;
    if (!events.has(event) || !stages.has(stage)) return;
    const environment = ["production", "preview", "development"].includes(process.env.VERCEL_ENV ?? "") ? process.env.VERCEL_ENV : "local";
    const sha = process.env.VERCEL_GIT_COMMIT_SHA;
    const deployment = process.env.VERCEL_DEPLOYMENT_ID;
    const level = error ? (fields.status && fields.status >= 400 && fields.status < 500 ? "warn" : "error") : fields.outcome === "partial success" ? "warn" : "info";
    const record = {
      timestamp: new Date().toISOString(), level, event, stage,
      requestId: SESSION_ID_PATTERN.test(context.requestId) ? context.requestId : undefined,
      diagnosticSessionId: context.diagnosticSessionId && SESSION_ID_PATTERN.test(context.diagnosticSessionId) ? context.diagnosticSessionId.toLowerCase() : undefined,
      route: context.route === "/api/search" || context.route === "/api/resolve-location" ? context.route : "other",
      environment,
      commitSha: sha && /^[a-f0-9]{40}$/i.test(sha) ? sha : "unknown",
      deploymentId: deployment && /^dpl_[a-zA-Z0-9]{1,80}$/.test(deployment) ? deployment : "unknown",
      durationMs: finite(fields.durationMs) ? Math.round(fields.durationMs * 1000) / 1000 : undefined,
      scheduledMs: finite(fields.scheduledMs) ? fields.scheduledMs : undefined,
      status: Number.isInteger(fields.status) && fields.status! >= 100 && fields.status! <= 599 ? fields.status : undefined,
      category: categories.has(fields.category ?? "") ? fields.category : undefined,
      outcome: outcomes.has(fields.outcome ?? "") ? fields.outcome : undefined,
      error: error ? { type: errorTypes.has(error.type) ? error.type : "internal", code: safeCode(error.code) } : undefined,
      handled: error ? handled === true : undefined,
    };
    if (level === "warn") console.warn(JSON.stringify(record));
    else if (error) console.error(JSON.stringify(record));
    else console.info(JSON.stringify(record));
  } catch { /* Observability must never change business behavior, even if the sink fails. */ }
}
