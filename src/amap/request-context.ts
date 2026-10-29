import { AmapApiError, RequestTerminatedError } from "./errors.js";

export interface RequestContext {
  readonly signal: AbortSignal;
  remainingMs?(): number;
  check?(): void;
  abort(error: AmapApiError): void;
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason instanceof AmapApiError ? signal.reason : new RequestTerminatedError("REQUEST_CANCELLED");
}

export function createRequestContext(parent?: AbortSignal | RequestContext, timeoutMs?: number,
  timeoutCode: "REQUEST_DEADLINE_EXCEEDED" | "UPSTREAM_TIMEOUT" | AmapApiError = "REQUEST_DEADLINE_EXCEEDED") {
  const controller = new AbortController();
  const parentContext = parent && "signal" in parent ? parent : undefined;
  const parentSignal = parentContext?.signal ?? parent as AbortSignal | undefined;
  const parentRemaining = parentContext?.remainingMs?.() ?? Infinity;
  const budget = Math.max(0, Math.min(timeoutMs ?? Infinity, parentRemaining));
  const deadline = performance.now() + budget;
  const reason = typeof timeoutCode === "string" ? new RequestTerminatedError(timeoutCode) : timeoutCode;
  const onAbort = () => controller.abort(parentSignal?.reason instanceof AmapApiError ? parentSignal.reason : new RequestTerminatedError("REQUEST_CANCELLED"));
  const expire = () => {
    if (parentContext && (parentContext.remainingMs?.() ?? Infinity) <= 0) {
      try { parentContext.check?.(); } catch { /* Preserve the parent's typed reason. */ }
      if (!parentContext.signal.aborted) parentContext.abort(new RequestTerminatedError("REQUEST_DEADLINE_EXCEEDED"));
    }
    if (parentSignal?.aborted) onAbort();
    else controller.abort(reason);
  };
  const check = () => {
    try { parentContext?.check?.(); }
    catch (error) { if (!parentSignal?.aborted) throw error; }
    if (parentSignal?.aborted) onAbort();
    if (performance.now() >= deadline) expire();
    throwIfAborted(controller.signal);
  };
  if (parentSignal?.aborted) onAbort();
  else parentSignal?.addEventListener("abort", onAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = () => {
    const left = deadline - performance.now();
    if (left > 0) timer = setTimeout(tick, Math.ceil(left));
    else expire();
  };
  if (Number.isFinite(budget)) timer = setTimeout(tick, Math.ceil(budget));
  return {
    signal: controller.signal,
    check,
    remainingMs() { return Math.max(0, deadline - performance.now()); },
    async wait(milliseconds: number) { check(); if (milliseconds > 0) await cancellableDelay(milliseconds, controller.signal); check(); },
    abort(error: AmapApiError) { controller.abort(error); },
    dispose() { clearTimeout(timer); parentSignal?.removeEventListener("abort", onAbort); },
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
