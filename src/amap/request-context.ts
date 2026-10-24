import { AmapApiError, RequestTerminatedError } from "./errors.js";

export interface RequestContext {
  readonly signal: AbortSignal;
  abort(error: AmapApiError): void;
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason instanceof AmapApiError ? signal.reason : new RequestTerminatedError("REQUEST_CANCELLED");
}

export function createRequestContext(parent?: AbortSignal, timeoutMs?: number,
  timeoutCode: "REQUEST_DEADLINE_EXCEEDED" | "UPSTREAM_TIMEOUT" = "REQUEST_DEADLINE_EXCEEDED") {
  const controller = new AbortController();
  const onAbort = () => controller.abort(parent?.reason instanceof AmapApiError ? parent.reason : new RequestTerminatedError("REQUEST_CANCELLED"));
  if (parent?.aborted) onAbort();
  else parent?.addEventListener("abort", onAbort, { once: true });
  const timer = timeoutMs === undefined ? undefined : setTimeout(() => controller.abort(new RequestTerminatedError(timeoutCode)), timeoutMs);
  return {
    signal: controller.signal,
    abort(error: AmapApiError) { controller.abort(error); },
    dispose() { clearTimeout(timer); parent?.removeEventListener("abort", onAbort); },
  };
}

/** Bounds even non-cooperative mocks/readers. The real operation also receives signal. */
export function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => { cleanup(); try { throwIfAborted(signal); } catch (error) { reject(error); } };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    operation.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function cancellableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await abortable(new Promise<void>(resolve => { timer = setTimeout(resolve, milliseconds); }), signal); }
  finally { clearTimeout(timer); }
}
