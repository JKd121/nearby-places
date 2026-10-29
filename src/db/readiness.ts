import { AdmissionError, transientAdmission, isTransientDatabaseError } from "../admission/errors.js";
import { abortable, cancellableDelay, createRequestContext, throwIfAborted } from "../amap/request-context.js";

export interface DatabaseReadinessOptions {
  probe(): Promise<void>;
  hasConnection(): boolean;
  now?: () => number;
  timeoutMs?: number;
  freshMs?: number;
  cooldownMs?: number;
}

/** One coordinator per pool/instance. A cancelled waiter never cancels other waiters. */
export function createDatabaseReadiness(options: DatabaseReadinessOptions) {
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const freshMs = options.freshMs ?? 10_000;
  const cooldownMs = options.cooldownMs ?? 1_000;
  let readyAt: number | null = null;
  let failedAt: number | null = null;
  let generation = 0;
  let pending: Promise<void> | null = null;
  const healthy = () => readyAt !== null && now() >= readyAt && now() - readyAt < freshMs && options.hasConnection();
  function invalidate() { generation++; readyAt = null; }
  function start() {
    const current = generation;
    // The shared probe owns its clock; cancelling one waiter only ends its wait.
    const lifetime = createRequestContext(undefined, timeoutMs, transientAdmission());
    const raw = Promise.resolve().then(options.probe);
    const result = abortable(raw, lifetime.signal).then(() => {
      if (generation !== current || !options.hasConnection()) throw transientAdmission();
      readyAt = now(); failedAt = null;
    }).catch(error => {
      readyAt = null; failedAt = now();
      if (error instanceof AdmissionError) throw error;
      const code = (error as { code?: string } | null)?.code;
      throw code && /^[0-9A-Z]{5}$/.test(code) && !isTransientDatabaseError(error) ? new AdmissionError("ADMISSION_UNAVAILABLE") : transientAdmission();
    }).finally(() => lifetime.dispose());
    pending = result;
    // Keep the slot occupied until BOTH the caller deadline and underlying work settle.
    // A slow/cancelled operation cannot trigger overlapping replacement probes.
    void Promise.allSettled([raw, result]).then(() => { if (pending === result) pending = null; });
    return result;
  }
  return {
    invalidate,
    touch() { if (readyAt !== null) readyAt = now(); },
    async ensure(signal?: AbortSignal) {
      throwIfAborted(signal);
      if (!pending && healthy()) return;
      const failureAge = failedAt === null ? Infinity : now() - failedAt;
      if (!pending && failureAge >= 0 && failureAge < cooldownMs) await cancellableDelay(cooldownMs - failureAge, signal);
      throwIfAborted(signal);
      if (!pending && healthy()) return;
      await abortable(pending ?? start(), signal);
      if (!healthy()) throw transientAdmission();
    },
  };
}
