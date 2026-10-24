import { AmapApiError, safeErrorDiagnostic } from "./errors.js";
import { abortable, createRequestContext, throwIfAborted, type RequestContext } from "./request-context.js";
import { measureAsync, measureSync, type Diagnostics, type DiagnosticErrorType } from "../diagnostics.js";
import { STAGE_A_POLICY } from "./policy.js";

export type AmapOperation = "geocode" | "poi-text" | "nearby";
export interface TransportPolicy { upstreamTimeoutMs: number; maxResponseBytes: number; }
/** Stage B implements this at the transport boundary, never in a Route/business method. */
export type BeforeAmapAttempt = (operation: AmapOperation, signal: AbortSignal) => Promise<void>;
export interface AmapTransportOptions {
  policy?: TransportPolicy;
  context?: RequestContext;
  diagnostics?: Diagnostics;
  beforeAttempt?: BeforeAmapAttempt;
}
export interface AmapTransport {
  requestJson(url: URL, operation: AmapOperation, context?: RequestContext): Promise<Record<string, unknown>>;
}

const PATHS: Record<AmapOperation, string> = { geocode: "/v3/geocode/geo", "poi-text": "/v5/place/text", nearby: "/v5/place/around" };
// https://lbs.amap.com/api/webservice/guide/tools/info
const AUTH_CODES = new Set(["10001", "10002", "10005", "10006", "10007", "10008", "10009", "10012", "10013", "10026", "10041"]);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

async function readBounded(response: Response, maxBytes: number, signal: AbortSignal): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let complete = false;
  try {
    while (true) {
      throwIfAborted(signal);
      const { done, value } = await abortable(reader.read(), signal);
      if (done) { complete = true; break; }
      size += value.byteLength;
      if (size > maxBytes) throw new AmapApiError("Upstream response exceeded size limit", null, null, "UPSTREAM_BODY_TOO_LARGE");
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder().decode(bytes);
  } finally {
    // Do not let an uncooperative cancel() delay error delivery.
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function createAmapTransport(fetchImpl: typeof fetch = fetch, options: AmapTransportOptions = {}): AmapTransport {
  const policy = options.policy ?? STAGE_A_POLICY;
  if (![policy.upstreamTimeoutMs, policy.maxResponseBytes].every(value => Number.isSafeInteger(value) && value > 0)) throw new RangeError("Invalid transport policy");
  const diagnostics = options.diagnostics;
  return {
    async requestJson(url, operation, context = options.context) {
      if (url.origin !== "https://restapi.amap.com" || url.pathname !== PATHS[operation] || url.username || url.password) throw new AmapApiError("Unsupported upstream endpoint", null, null, "UPSTREAM_INVALID_PAYLOAD");
      throwIfAborted(context?.signal);
      // Budget checks will run here before each real HTTP attempt. No retries/refunds.
      if (options.beforeAttempt) await abortable(options.beforeAttempt(operation, context?.signal ?? new AbortController().signal), context?.signal);
      throwIfAborted(context?.signal);
      const call = createRequestContext(context?.signal, policy.upstreamTimeoutMs, "UPSTREAM_TIMEOUT");
      try {
        const response = await measureAsync(diagnostics, "amap.fetch", () => abortable(fetchImpl(url, { signal: call.signal, redirect: "error", cache: "no-store" }).then(response => {
          if (call.signal.aborted) void response.body?.cancel().catch(() => {});
          return response;
        }), call.signal));
        const body = await measureAsync(diagnostics, "amap.read", () => readBounded(response, policy.maxResponseBytes, call.signal));
        throwIfAborted(call.signal);
        if (!response.ok) throw new AmapApiError("Upstream HTTP failure", null, null, response.status === 401 || response.status === 403 ? "UPSTREAM_AUTH_FAILED" : "UPSTREAM_HTTP", response.status);
        const payload: unknown = measureSync(diagnostics, "amap.json", () => {
          try { return JSON.parse(body); }
          catch { throw new AmapApiError("Invalid upstream JSON", null, null, "UPSTREAM_INVALID_JSON"); }
        });
        return measureSync(diagnostics, "amap.validate", () => {
          if (!isRecord(payload)) throw new AmapApiError("Invalid upstream payload", null, null, "UPSTREAM_INVALID_PAYLOAD");
          if (payload.status !== "1") {
            const code = typeof payload.infocode === "string" && /^\d{5,6}$/.test(payload.infocode) ? payload.infocode : null;
            // Retain only a recognized provider diagnostic, never arbitrary info text.
            const info = code === "10009" ? "USERKEY_PLAT_NOMATCH" : null;
            throw new AmapApiError("Upstream business failure", info, code, code && AUTH_CODES.has(code) ? "UPSTREAM_AUTH_FAILED" : "UPSTREAM_BUSINESS");
          }
          return payload;
        });
      } catch (error) {
        if (call.signal.aborted) { try { throwIfAborted(call.signal); } catch (reason) { error = reason; } }
        const failure = error instanceof AmapApiError ? error : new AmapApiError("Upstream network failure", null, null, "UPSTREAM_NETWORK");
        const diagnosticType: DiagnosticErrorType = failure.code === "REQUEST_CANCELLED" ? "cancelled"
          : failure.code === "UPSTREAM_TIMEOUT" || failure.code === "REQUEST_DEADLINE_EXCEEDED" ? "timeout"
          : failure.code === "UPSTREAM_HTTP" ? "upstream_http"
          : failure.code === "UPSTREAM_INVALID_JSON" ? "invalid_json"
          : failure.code === "UPSTREAM_INVALID_PAYLOAD" ? "invalid_payload"
          : failure.code === "UPSTREAM_BODY_TOO_LARGE" ? "response_too_large"
          : failure.code === "UPSTREAM_NETWORK" ? "network" : "upstream_business";
        diagnostics?.annotate(failure, diagnosticType, failure.infocode ?? failure.code);
        console.error("amap.failed", { operation, ...safeErrorDiagnostic(failure) });
        throw failure;
      } finally { call.dispose(); }
    },
  };
}
