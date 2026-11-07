import { abortable, createRequestContext, throwIfAborted, type RequestContext } from "../amap/request-context.js";
import { getRequestPolicy, type RequestPolicy } from "./request-policy.js";
import { mapServerError } from "./http.js";
import { AmapApiError, isRequestTerminal, RequestBodyTooLargeError } from "../amap/errors.js";

/** Starts before body parsing and owns cleanup for every exit, including validation errors. */
export async function withRequestLifecycle(request: Request,
  handle: (context: RequestContext, policy: RequestPolicy) => Promise<Response>,
  onDeadline?: () => Response | undefined): Promise<Response> {
  try {
    throwIfAborted(request.signal);
    const policy = getRequestPolicy();
    const context = createRequestContext(request.signal, policy.requestTimeoutMs);
    try {
      const result = await abortable(handle(context, policy), context.signal);
      context.check();
      result.headers.set("cache-control", "private, no-store");
      return result;
    } catch (error) {
      throwIfAborted(request.signal);
      if (isRequestTerminal(error)) context.abort(error);
      if (error instanceof AmapApiError && error.code === "REQUEST_DEADLINE_EXCEEDED") {
        const partial = onDeadline?.();
        if (partial) return partial;
      }
      throw error;
    } finally { context.dispose(); }
  } catch (error) { return mapServerError(error); }
}

export async function readRequestJson(request: Request, context: RequestContext, maxRequestBytes: number): Promise<unknown> {
  throwIfAborted(context.signal);
  if (!request.body) return JSON.parse("");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let complete = false;
  let size = 0;
  try {
    while (true) {
      const { done, value } = await abortable(reader.read(), context.signal);
      throwIfAborted(context.signal);
      if (done) { complete = true; break; }
      // Limit application-accepted bytes, not the network/runtime allocation peak.
      if (value.byteLength > maxRequestBytes - size) {
        const error = new RequestBodyTooLargeError();
        context.abort(error);
        throw error;
      }
      size += value.byteLength;
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return JSON.parse(parts.join("")) as unknown;
  } catch (error) { throwIfAborted(context.signal); throw error; }
  finally {
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
