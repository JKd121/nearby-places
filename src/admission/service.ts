import { AdmissionError } from "./errors.js";
import { AmapApiError } from "../amap/errors.js";
import { abortable, createRequestContext, throwIfAborted, type RequestContext } from "../amap/request-context.js";
import type { AmapOperation, AttemptPermit, BeforeAmapAttempt } from "../amap/transport.js";
import { admissionErrorKind, isAdmissionDatabaseError, type AdmissionDatabase, type AdmissionExecution, type AdmissionPhase } from "./database.js";
export type { AdmissionDatabase } from "./database.js";

export interface Reservation {
  resourceId: string; version: number; scheduledAt: Date; expiresAt: Date;
  delayMs: number; validForMs: number;
}
export type Grant = { delayMs: number; validForMs?: never } | { validForMs: number; delayMs?: never };
export interface AdmissionTrace { attemptId: string; }
const WAIT_LIMIT_MS = 2_000;
const record = (value: unknown): Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw new AdmissionError("ADMISSION_UNAVAILABLE");
  return value;
}

/** Shanghai calendar, independent of the host/session timezone. */
export function budgetPeriod(now: Date) {
  const shifted = new Date(now.getTime() + 8 * 3_600_000);
  const day = shifted.toISOString().slice(0, 10), month = day.slice(0, 7);
  const y = shifted.getUTCFullYear(), m = shifted.getUTCMonth(), d = shifted.getUTCDate();
  return { day, month, nextDay: new Date(Date.UTC(y, m, d + 1) - 8 * 3_600_000).toISOString(),
    nextMonth: new Date(Date.UTC(y, m + 1, 1) - 8 * 3_600_000).toISOString() };
}


/** Decode only the fixed protocol returned after the executor confirms COMMIT. */
export class PostgresAdmissionStore {
  constructor(private readonly db: AdmissionDatabase) {}

  private async call<T>(phase: AdmissionPhase, values: readonly unknown[], signal: AbortSignal, remaining: () => number, decode: (row: Record<string, unknown>) => T, operation: AmapOperation, trace?: AdmissionTrace): Promise<T> {
    throwIfAborted(signal);
    let execution: AdmissionExecution | undefined;
    try {
      execution = await this.db.execute(phase, values, signal, remaining);
      throwIfAborted(signal);
      if (remaining() <= 0) throw new AdmissionError("ADMISSION_WAIT_EXCEEDED");
      const row = record(execution.value);
      if (["ADMISSION_UNAVAILABLE", "ADMISSION_WAIT_EXCEEDED", "DAILY_BUDGET_EXHAUSTED", "MONTHLY_BUDGET_EXHAUSTED"].includes(String(row.code))) {
        let retryAt: string | undefined;
        if (row.retryAt !== undefined) {
          if (typeof row.retryAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(row.retryAt) || !Number.isFinite(Date.parse(row.retryAt))) throw new AdmissionError("ADMISSION_UNAVAILABLE");
          retryAt = row.retryAt;
        }
        throw new AdmissionError(row.code as ConstructorParameters<typeof AdmissionError>[0], retryAt);
      }
      return decode(row);
    } catch (caught) {
      const databaseError = isAdmissionDatabaseError(caught) ? caught : undefined;
      let error = databaseError ? databaseError.original : caught;
      const diagnostic = databaseError?.diagnostic ?? execution?.diagnostic;
      // The shared startup executor can also construct its own copy of AdmissionError.
      const original = record(error);
      if (databaseError && original.name === "AdmissionError" && (original.code === "ADMISSION_UNAVAILABLE" || original.code === "ADMISSION_WAIT_EXCEEDED")) {
        error = new AdmissionError(original.code);
      }
      try {
        console.error("admission.failed", { phase, step: diagnostic?.step ?? "response", acquireMs: diagnostic?.acquireMs ?? 0,
          batchMs: diagnostic?.batchMs ?? 0, elapsedMs: diagnostic?.elapsedMs ?? 0,
          remainingMs: diagnostic?.remainingMs ?? Math.max(0, Math.floor(remaining())), budgetMs: diagnostic?.budgetMs ?? 0,
          maxWaitMs: diagnostic?.maxWaitMs ?? 0, committed: diagnostic?.committed ?? false, sqlState: diagnostic?.sqlState ?? null,
          admissionCode: error instanceof AmapApiError ? error.code : null,
          attemptId: trace?.attemptId ?? null, operation,
          readTimeoutMs: diagnostic?.readTimeoutMs ?? 0, statements: diagnostic?.statements ?? [],
          functionToCommitMs: diagnostic?.functionToCommitMs ?? null, commitAck: diagnostic?.commitAck ?? "not_submitted",
          connectionDestroyed: diagnostic?.connectionDestroyed ?? false, errorKind: diagnostic?.errorKind ?? admissionErrorKind(error) });
      } catch { /* A log sink failure cannot change admission behavior. */ }
      throwIfAborted(signal);
      if (error instanceof AmapApiError) throw error;
      throw new AdmissionError("ADMISSION_UNAVAILABLE");
    }
  }

  reserve(credentialId: string, operation: AmapOperation, signal: AbortSignal, remaining: () => number, trace?: AdmissionTrace): Promise<Reservation> {
    return this.call("reserve", [credentialId, operation], signal, remaining, row => {
      if (row.code !== "OK" || typeof row.resourceId !== "string" || row.resourceId.length === 0) throw new AdmissionError("ADMISSION_UNAVAILABLE");
      const scheduled = integer(row.scheduledAtMs, 0, 8_640_000_000_000_000), expires = integer(row.expiresAtMs, 0, 8_640_000_000_000_000);
      const validForMs = integer(row.validForMs, 1, WAIT_LIMIT_MS), delayMs = integer(row.delayMs, 0, WAIT_LIMIT_MS);
      if (scheduled >= expires || expires - scheduled !== validForMs - delayMs || delayMs >= validForMs) throw new AdmissionError("ADMISSION_UNAVAILABLE");
      return { resourceId: row.resourceId, version: integer(row.version, 1), scheduledAt: new Date(scheduled), expiresAt: new Date(expires), delayMs, validForMs };
    }, operation, trace);
  }

  async grant(credentialId: string, operation: AmapOperation, ticket: Reservation, signal: AbortSignal, remaining: () => number, trace?: AdmissionTrace): Promise<Grant> {
    return this.call("grant", [credentialId, operation, ticket.resourceId, ticket.version,
      integer(ticket.scheduledAt.getTime(), 0), integer(ticket.expiresAt.getTime(), 0)], signal, remaining, row => {
      if (row.code === "WAIT") return { delayMs: integer(row.delayMs, 1, WAIT_LIMIT_MS) };
      if (row.code !== "OK") throw new AdmissionError("ADMISSION_UNAVAILABLE");
      return { validForMs: integer(row.validForMs, 1, WAIT_LIMIT_MS) };
    }, operation, trace);
  }
}

/** Local ingress protection only; reservations are globally coordinated in PostgreSQL. */
export function createAdmission(store: PostgresAdmissionStore | (() => Promise<PostgresAdmissionStore>), credentialId: string): BeforeAmapAttempt {
  let active = 0;
  return async (operation, parentSignal, context?: RequestContext): Promise<AttemptPermit> => {
    throwIfAborted(parentSignal);
    if (active >= 12) throw new AdmissionError("ADMISSION_UNAVAILABLE");
    const trace: AdmissionTrace = { attemptId: crypto.randomUUID() };
    active++;
    const lifetime = createRequestContext(context ?? parentSignal, WAIT_LIMIT_MS, new AdmissionError("ADMISSION_WAIT_EXCEEDED"));
    const signal = lifetime.signal;
    const remaining = () => lifetime.remainingMs();
    const check = () => {
      throwIfAborted(parentSignal);
      lifetime.check();
    };
    const work = (async () => { try {
      check();
      const repository = typeof store === "function" ? await store() : store;
      check();
      const reservedStart = performance.now();
      const ticket = await repository.reserve(credentialId, operation, signal, remaining, trace);
      // Conservatively subtract the entire DB round trip, not just its return leg.
      const ticketEnd = reservedStart + ticket.validForMs;
      check();
      if (performance.now() >= ticketEnd) throw new AdmissionError("ADMISSION_WAIT_EXCEEDED");
      // DB v1 rejects arrivals before scheduledAt. A round trip cannot identify
      // the response leg, so wait from receipt rather than subtracting its RTT.
      await lifetime.wait(ticket.delayMs);
      check();
      if (performance.now() >= ticketEnd) throw new AdmissionError("ADMISSION_WAIT_EXCEEDED");
      let grantStart = performance.now();
      let grant = await repository.grant(credentialId, operation, ticket, signal, () => Math.min(remaining(), ticketEnd - performance.now()), trace);
      if (grant.delayMs !== undefined) {
        // WAIT was sampled inside the DB. Waiting from receipt is conservative and
        // bounds this protocol to one final recheck without a polling loop.
        await lifetime.wait(grant.delayMs);
        check();
        if (performance.now() >= ticketEnd) throw new AdmissionError("ADMISSION_WAIT_EXCEEDED");
        grantStart = performance.now();
        grant = await repository.grant(credentialId, operation, ticket, signal, () => Math.min(remaining(), ticketEnd - performance.now()), trace);
      }
      if (grant.validForMs === undefined) throw new AdmissionError("ADMISSION_WAIT_EXCEEDED");
      const permitEnd = Math.min(ticketEnd, grantStart + grant.validForMs);
      let used = false;
      return { assertValid() {
        check();
        if (used || performance.now() >= permitEnd) throw new AdmissionError("ADMISSION_WAIT_EXCEEDED");
        used = true;
      } };
    } catch (error) {
      if (error instanceof AmapApiError) throw error;
      throw new AdmissionError("ADMISSION_UNAVAILABLE");
    } finally { lifetime.dispose(); active--; } })();
    try { return await abortable(work, signal); }
    catch (error) {
      throwIfAborted(parentSignal);
      throw error;
    }
  };
}
