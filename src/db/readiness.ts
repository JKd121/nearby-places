import { AdmissionError } from "../admission/errors.js";
import { abortable, throwIfAborted } from "../amap/request-context.js";

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
    let timer: ReturnType<typeof setTimeout>;
    const raw = Promise.resolve().then(options.probe);
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new AdmissionError("ADMISSION_UNAVAILABLE")), timeoutMs); });
    const result = Promise.race([raw, deadline]).then(() => {
      if (generation !== current || !options.hasConnection()) throw new AdmissionError("ADMISSION_UNAVAILABLE");
      readyAt = now(); failedAt = null;
    }).catch(() => {
      readyAt = null; failedAt = now();
      throw new AdmissionError("ADMISSION_UNAVAILABLE");
    }).finally(() => clearTimeout(timer));
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
      if (!pending && failureAge >= 0 && failureAge < cooldownMs) throw new AdmissionError("ADMISSION_UNAVAILABLE");
      await abortable(pending ?? start(), signal);
      if (!healthy()) throw new AdmissionError("ADMISSION_UNAVAILABLE");
    },
  };
}
