import { resolveAmapAccess } from "./amap-access.js";
import { AmapApiError, RequestTerminatedError } from "../amap/errors.js";
import { abortable, createRequestContext, throwIfAborted } from "../amap/request-context.js";
import type { ConfirmedSearchRequest, SearchStreamEvent } from "../search/contracts.js";
import { executeResolvedSearch, searchDeadlineResponse, type SearchSnapshot } from "../search/service.js";
import { parseConfirmedSearchRequest, SearchRequestValidationError } from "../search/validation.js";
import { createServerAmapClient } from "./amap.js";
import { jsonError, mapServerError } from "./http.js";
import { readRequestJson } from "./request-lifecycle.js";
import { getRequestPolicy } from "./request-policy.js";

/** Own the context until the body closes, including cancellation after headers. */
export async function searchStreamResponse(request: Request): Promise<Response> {
  let context: ReturnType<typeof createRequestContext> | undefined;
  try {
    throwIfAborted(request.signal);
    const policy = getRequestPolicy();
    const lifetime = context = createRequestContext(request.signal, policy.requestTimeoutMs);
    let body: unknown;
    try { body = await readRequestJson(request, lifetime, policy.maxRequestBytes); }
    catch { lifetime.check(); throwIfAborted(lifetime.signal); lifetime.dispose(); return jsonError("请求必须是有效 JSON", 400); }
    let parsed: ConfirmedSearchRequest;
    try { parsed = parseConfirmedSearchRequest(body); }
    catch (error) {
      lifetime.dispose();
      return jsonError(error instanceof SearchRequestValidationError ? error.message : "请求校验失败", 400);
    }
    lifetime.check();
    // Assemble before sending headers so configuration errors retain HTTP status.
    const client = createServerAmapClient(undefined, lifetime, policy, await resolveAmapAccess(request, policy.upstreamTimeoutMs));
    let closed = false;
    let snapshot: SearchSnapshot = { results: [], active: [], pending: parsed.categoryIds };
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: SearchStreamEvent) => {
          if (!closed && !request.signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        };
        void (async () => {
          try {
            const response = await abortable(executeResolvedSearch(parsed, client, {
              context: lifetime,
              onSnapshot(current) {
                // Freeze the last live snapshot; deadline cleanup can publish failed slots.
                if (!lifetime.signal.aborted) { snapshot = current; send({ type: "progress", progress: current }); }
              },
            }), lifetime.signal);
            lifetime.check();
            send({ type: "complete", response });
          } catch (error) {
            if (closed || request.signal.aborted) return;
            const partial = error instanceof AmapApiError && error.code === "REQUEST_DEADLINE_EXCEEDED"
              ? searchDeadlineResponse(parsed, snapshot) : undefined;
            if (partial) send({ type: "complete", response: partial });
            else {
              const safe = await mapServerError(error).json() as { error: { message: string; code?: string } };
              send({ type: "error", error: safe.error });
            }
          } finally {
            if (!closed) { closed = true; controller.close(); }
            lifetime.dispose();
          }
        })();
      },
      cancel() {
        closed = true;
        lifetime.abort(new RequestTerminatedError("REQUEST_CANCELLED"));
        lifetime.dispose();
      },
    });
    return new Response(stream, { headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
      "vary": "Accept",
    } });
  } catch (error) { context?.dispose(); return mapServerError(error); }
}
