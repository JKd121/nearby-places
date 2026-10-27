import { AdmissionError } from "./errors.js";
import { AmapApiError, RequestTerminatedError } from "../amap/errors.js";
import { abortable, createRequestContext, cancellableDelay, throwIfAborted, type RequestContext } from "../amap/request-context.js";
import type { AmapOperation, AttemptPermit, BeforeAmapAttempt } from "../amap/transport.js";

export interface AdmissionSql {
  $queryRawUnsafe<T = unknown>(sql: string, ...values: unknown[]): Promise<T>;
}
export interface AdmissionDatabase {
  $transaction<T>(run: (tx: AdmissionSql) => Promise<T>, options: { maxWait: number; timeout: number }): Promise<T>;
}
interface Resource {
  id: string; policyVersion: number; enabled: boolean;
  dailyLimit: number; monthlyLimit: number; intervalMs: number; waitMs: number; graceMs: number; permitTtlMs: number;
  day: string; month: string; dayUsed: number; monthUsed: number;
  nextReservationAt: Date; consumedReservationAt: Date; nextGrantAt: Date;
}
type ResourceRow = Resource & { reservationMs: string; consumedMs: string; grantMs: string };
export interface Reservation {
  resourceId: string; version: number; scheduledAt: Date; expiresAt: Date;
  delayMs: number; validForMs: number;
}
const WAIT_LIMIT_MS = 2_000;
const TX_LIMIT_MS = 800;

function policyValid(row: Resource) {
  return row.enabled && [row.dailyLimit, row.monthlyLimit, row.intervalMs, row.waitMs, row.graceMs, row.permitTtlMs]
    .every(n => Number.isSafeInteger(n) && n > 0) && row.waitMs <= WAIT_LIMIT_MS;
}

/** Shanghai calendar, independent of the host/session timezone. */
export function budgetPeriod(now: Date) {
  const shifted = new Date(now.getTime() + 8 * 3_600_000);
  const day = shifted.toISOString().slice(0, 10), month = day.slice(0, 7);
  const y = shifted.getUTCFullYear(), m = shifted.getUTCMonth(), d = shifted.getUTCDate();
  return { day, month, nextDay: new Date(Date.UTC(y, m, d + 1) - 8 * 3_600_000).toISOString(),
    nextMonth: new Date(Date.UTC(y, m + 1, 1) - 8 * 3_600_000).toISOString() };
}

/** All SQL text is constant; values are bound parameters, never interpolated. */
export class PostgresAdmissionStore {
  constructor(private readonly db: AdmissionDatabase) {}

  private async transaction<T>(signal: AbortSignal, remaining: () => number, run: (tx: AdmissionSql) => Promise<T>): Promise<T> {
    throwIfAborted(signal);
    const budget = Math.floor(Math.min(TX_LIMIT_MS, remaining()));
    if (budget < 1) throw new AdmissionError("ADMISSION_WAIT_EXCEEDED");
    try {
      return await this.db.$transaction(async tx => {
        throwIfAborted(signal);
        // Server-side limits also apply after the JS caller stops awaiting.
        await tx.$queryRawUnsafe("SELECT set_config('statement_timeout', $1, true), set_config('lock_timeout', $2, true), set_config('idle_in_transaction_session_timeout', $1, true)", String(budget), String(Math.min(150, budget)));
        throwIfAborted(signal);
        const result = await run(tx);
        throwIfAborted(signal);
        if (remaining() <= 0) throw new AdmissionError("ADMISSION_WAIT_EXCEEDED");
        return result;
      }, { maxWait: Math.min(200, budget), timeout: budget });
    } catch (error) {
      throwIfAborted(signal);
      if (error instanceof AmapApiError) throw error;
      // Includes ambiguous commits. No transaction retry or compensation.
      throw new AdmissionError("ADMISSION_UNAVAILABLE");
    }
  }

  private async resource(tx: AdmissionSql, credentialId: string, operation: AmapOperation, expectedId?: string) {
    // Both paths lock resource then binding. Binding lock fences remapping/deletion.
    // Read timestamptz as epoch text. PrismaPg raw Date decoding depends on
    // the PostgreSQL session timezone and can otherwise shift wall-clock time.
    const rows = await tx.$queryRawUnsafe<ResourceRow[]>(`SELECT r.*,
      (extract(epoch FROM r."nextReservationAt") * 1000)::bigint::text AS "reservationMs",
      (extract(epoch FROM r."consumedReservationAt") * 1000)::bigint::text AS "consumedMs",
      (extract(epoch FROM r."nextGrantAt") * 1000)::bigint::text AS "grantMs"
      FROM "AmapResource" r
      WHERE r.id = (SELECT "resourceId" FROM "AmapOperationBinding" WHERE "credentialId"=$1 AND operation=$2)
      FOR UPDATE OF r`, credentialId, operation);
    const row = rows[0];
    if (!row || !policyValid(row) || (expectedId !== undefined && expectedId !== row.id)) throw new AdmissionError("ADMISSION_UNAVAILABLE");
    row.nextReservationAt = new Date(Number(row.reservationMs));
    row.consumedReservationAt = new Date(Number(row.consumedMs));
    row.nextGrantAt = new Date(Number(row.grantMs));
    if ([row.nextReservationAt, row.consumedReservationAt, row.nextGrantAt].some(d => !Number.isFinite(d.getTime()))) throw new AdmissionError("ADMISSION_UNAVAILABLE");
    const bindings = await tx.$queryRawUnsafe<{ resourceId: string }[]>(`SELECT "resourceId" FROM "AmapOperationBinding"
      WHERE "credentialId"=$1 AND operation=$2 FOR SHARE`, credentialId, operation);
    if (bindings[0]?.resourceId !== row.id) throw new AdmissionError("ADMISSION_UNAVAILABLE");
    return row;
  }

  private async now(tx: AdmissionSql): Promise<Date> {
    const rows = await tx.$queryRawUnsafe<{ nowMs: string }[]>("SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint::text AS \"nowMs\"");
    const now = new Date(Number(rows[0]?.nowMs));
    if (!Number.isFinite(now.getTime())) throw new AdmissionError("ADMISSION_UNAVAILABLE");
    return now;
  }

  async reserve(credentialId: string, operation: AmapOperation, signal: AbortSignal, remaining: () => number): Promise<Reservation> {
    return this.transaction(signal, remaining, async tx => {
      const row = await this.resource(tx, credentialId, operation);
      const now = await this.now(tx);
      const scheduledAt = new Date(Math.max(now.getTime(), row.nextReservationAt.getTime()));
      const expiresAt = new Date(Math.min(now.getTime() + Math.min(row.waitMs, remaining()), scheduledAt.getTime() + row.graceMs));
      if (scheduledAt >= expiresAt) throw new AdmissionError("ADMISSION_WAIT_EXCEEDED");
      await tx.$queryRawUnsafe(`UPDATE "AmapResource" SET "nextReservationAt"=$2::timestamptz WHERE id=$1`, row.id, new Date(scheduledAt.getTime() + row.intervalMs).toISOString());
      return { resourceId: row.id, version: row.policyVersion, scheduledAt, expiresAt,
        delayMs: scheduledAt.getTime() - now.getTime(), validForMs: expiresAt.getTime() - now.getTime() };
    });
  }

  async grant(credentialId: string, operation: AmapOperation, ticket: Reservation, signal: AbortSignal, remaining: () => number) {
    return this.transaction(signal, remaining, async tx => {
      const row = await this.resource(tx, credentialId, operation, ticket.resourceId);
      const now = await this.now(tx);
      if (row.policyVersion !== ticket.version) throw new AdmissionError("ADMISSION_UNAVAILABLE");
      if (now < ticket.scheduledAt || now >= ticket.expiresAt || ticket.scheduledAt <= row.consumedReservationAt)
        throw new AdmissionError("ADMISSION_WAIT_EXCEEDED");
      if (now < row.nextGrantAt) {
        const delayMs = row.nextGrantAt.getTime() - now.getTime();
        if (delayMs >= Math.min(remaining(), ticket.expiresAt.getTime() - now.getTime())) throw new AdmissionError("ADMISSION_WAIT_EXCEEDED");
        // A successful read-only readiness decision, not a failed/ambiguous transaction retry.
        return { delayMs };
      }
      const period = budgetPeriod(now);
      const dayUsed = row.day === period.day ? row.dayUsed : 0, monthUsed = row.month === period.month ? row.monthUsed : 0;
      if (monthUsed >= row.monthlyLimit) throw new AdmissionError("MONTHLY_BUDGET_EXHAUSTED", period.nextMonth);
      if (dayUsed >= row.dailyLimit) throw new AdmissionError("DAILY_BUDGET_EXHAUSTED", period.nextDay);
      throwIfAborted(signal);
      await tx.$queryRawUnsafe(`UPDATE "AmapResource" SET day=$2, month=$3, "dayUsed"=$4, "monthUsed"=$5,
        "consumedReservationAt"=$6::timestamptz, "nextGrantAt"=$7::timestamptz WHERE id=$1`, row.id, period.day, period.month,
        dayUsed + 1, monthUsed + 1, ticket.scheduledAt.toISOString(), new Date(now.getTime() + row.intervalMs).toISOString());
      return { validForMs: Math.min(row.permitTtlMs, ticket.expiresAt.getTime() - now.getTime(), remaining()) };
    });
  }
}

/** Local ingress protection only; reservations are globally coordinated in PostgreSQL. */
export function createAdmission(store: PostgresAdmissionStore | (() => Promise<PostgresAdmissionStore>), credentialId: string): BeforeAmapAttempt {
  let active = 0;
  return async (operation, parentSignal, context?: RequestContext): Promise<AttemptPermit> => {
    throwIfAborted(parentSignal);
    if (active >= 12) throw new AdmissionError("ADMISSION_UNAVAILABLE");
    active++;
    const end = performance.now() + Math.min(WAIT_LIMIT_MS, context?.remainingMs?.() ?? WAIT_LIMIT_MS);
    const lifetime = createRequestContext(parentSignal, Math.max(1, end - performance.now()));
    const signal = lifetime.signal;
    const remaining = () => end - performance.now();
    const check = () => {
      if ((context?.remainingMs?.() ?? Infinity) <= 0) context?.abort(new RequestTerminatedError("REQUEST_DEADLINE_EXCEEDED"));
      throwIfAborted(parentSignal); throwIfAborted(signal);
      if (remaining() <= 0) throw new AdmissionError("ADMISSION_WAIT_EXCEEDED");
    };
    const work = (async () => { try {
      check();
      const repository = typeof store === "function" ? await store() : store;
      check();
      const reservedStart = performance.now();
      const ticket = await repository.reserve(credentialId, operation, signal, remaining);
      // Conservatively subtract the entire DB round trip, not just its return leg.
      const ticketEnd = Math.min(end, reservedStart + ticket.validForMs);
      check();
      if (performance.now() >= ticketEnd) throw new AdmissionError("ADMISSION_WAIT_EXCEEDED");
      await cancellableDelay(ticket.delayMs, signal);
      check();
      if (performance.now() >= ticketEnd) throw new AdmissionError("ADMISSION_WAIT_EXCEEDED");
      let grantStart = performance.now();
      let grant = await repository.grant(credentialId, operation, ticket, signal, () => Math.min(remaining(), ticketEnd - performance.now()));
      if (grant.delayMs !== undefined) {
        await cancellableDelay(grant.delayMs, signal);
        check();
        if (performance.now() >= ticketEnd) throw new AdmissionError("ADMISSION_WAIT_EXCEEDED");
        grantStart = performance.now();
        grant = await repository.grant(credentialId, operation, ticket, signal, () => Math.min(remaining(), ticketEnd - performance.now()));
      }
      if (grant.validForMs === undefined) throw new AdmissionError("ADMISSION_WAIT_EXCEEDED");
      const permitEnd = Math.min(ticketEnd, end, grantStart + grant.validForMs);
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
      if (error instanceof AmapApiError && error.code === "REQUEST_DEADLINE_EXCEEDED" && (context?.remainingMs?.() ?? Infinity) > 0)
        throw new AdmissionError("ADMISSION_WAIT_EXCEEDED");
      throw error;
    }
  };
}
