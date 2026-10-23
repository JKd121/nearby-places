/** Injection contract only: safe for core/CLI modules; no server runtime imports. */
export type DiagnosticStage = "request" | "request.json" | "request.validation" | "location.resolve" | "location.geocode" | "location.poi" | "location.normalize" | "search.category" | "search.inter_category_wait" | "amap.fetch" | "amap.read" | "amap.json" | "amap.validate" | "amap.transform";
export type DiagnosticEvent = "http.request.started" | "http.request.completed" | "phase.completed" | "phase.failed" | "diagnostics.error" | "search.completed" | "location.resolve.completed" | "search.category.completed";
export type DiagnosticErrorType = "network" | "timeout" | "upstream_http" | "upstream_business" | "invalid_json" | "invalid_payload" | "internal";
export interface DiagnosticFields {
  category?: string;
  status?: number;
  outcome?: string;
  durationMs?: number;
  scheduledMs?: number;
}
export interface Diagnostics {
  measure<T>(stage: DiagnosticStage, operation: () => Promise<T>, fields?: DiagnosticFields): Promise<T>;
  measureSync<T>(stage: DiagnosticStage, operation: () => T, fields?: DiagnosticFields): T;
  event(event: DiagnosticEvent, stage: DiagnosticStage, fields?: DiagnosticFields): void;
  annotate(error: unknown, type: DiagnosticErrorType, code?: string | null): void;
  error(error: unknown, stage: DiagnosticStage, handled: boolean, fields?: DiagnosticFields): void;
}
export function measureAsync<T>(diagnostics: Diagnostics | undefined, stage: DiagnosticStage, operation: () => Promise<T>, fields?: DiagnosticFields): Promise<T> {
  return diagnostics ? diagnostics.measure(stage, operation, fields) : operation();
}
export function measureSync<T>(diagnostics: Diagnostics | undefined, stage: DiagnosticStage, operation: () => T, fields?: DiagnosticFields): T {
  return diagnostics ? diagnostics.measureSync(stage, operation, fields) : operation();
}
