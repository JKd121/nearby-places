import { AdmissionError } from "./errors.js";
import { abortable, createRequestContext, throwIfAborted } from "../amap/request-context.js";

export type AdmissionPhase = "reserve" | "grant";
export interface AdmissionQueryResult { command: string; rows: Record<string, unknown>[]; }
export interface AdmissionConnection {
  readonly pipeline: boolean;
  query(config: { text: string; values?: unknown[]; query_timeout?: number }): Promise<AdmissionQueryResult>;
  release(destroy?: boolean): void;
  on?(event: "error", listener: (error: unknown) => void): unknown;
  removeListener?(event: "error", listener: (error: unknown) => void): unknown;
}
export interface AdmissionPool { connect(): Promise<AdmissionConnection>; }
export type AdmissionErrorKind = "driver_read_timeout" | "database" | "connection" | "cancelled" | "deadline" | "admission_refused" | "unknown";
export interface AdmissionStatementDiagnostic {
  step: "begin" | "configure" | "function" | "commit";
  submittedMs: number | null; settledMs: number | null;
  status: "not_submitted" | "pending" | "fulfilled" | "rejected";
  command: "BEGIN" | "SELECT" | "COMMIT" | "ROLLBACK" | null;
  sqlState: string | null; errorKind: AdmissionErrorKind | null;
}
export interface AdmissionDiagnostic {
  phase: AdmissionPhase;
  step: "acquire" | "begin" | "configure" | "function" | "commit" | "response";
  acquireMs: number; batchMs: number; elapsedMs: number;
  remainingMs: number; budgetMs: number; maxWaitMs: number;
  committed: boolean; sqlState: string | null;
  readTimeoutMs: number; statements: AdmissionStatementDiagnostic[];
  functionToCommitMs: number | null;
  commitAck: "confirmed_commit" | "confirmed_rollback" | "unconfirmed" | "not_submitted";
  connectionDestroyed: boolean; errorKind: AdmissionErrorKind | null;
}
export interface AdmissionExecution { value: unknown; diagnostic: AdmissionDiagnostic; }
export interface AdmissionDatabase {
  execute(phase: AdmissionPhase, values: readonly unknown[], signal: AbortSignal, remaining: () => number): Promise<AdmissionExecution>;
}
const DATABASE_ERROR = Symbol.for("nearby.admission.database.error.v1");
export class AdmissionDatabaseError extends Error {
  readonly [DATABASE_ERROR] = true;
  constructor(readonly diagnostic: AdmissionDiagnostic, readonly original: unknown) { super("Admission database failure"); }
}
/** Startup instrumentation and API routes can load separate copies of this module. */
export function isAdmissionDatabaseError(value: unknown): value is AdmissionDatabaseError {
  return typeof value === "object" && value !== null && DATABASE_ERROR in value && value[DATABASE_ERROR] === true;
}

const SQL = {
  reserve: "SELECT public.amap_admission_reserve_v1($1::text,$2::text,$3::integer) AS result",
  grant: "SELECT public.amap_admission_grant_v1($1::text,$2::text,$3::text,$4::integer,$5::bigint,$6::bigint,$7::integer) AS result",
};
const CONFIGURE = "SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true),set_config('idle_in_transaction_session_timeout',$1,true)";
const ms = (n: number) => Math.max(0, Math.round(n * 100) / 100);
function sqlState(error: unknown): string | null {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  return typeof code === "string" && /^(?:[0-5][0-9A-Z]|72|F0|HV|P0|XX)[0-9A-Z]{3}$/.test(code) ? code : null;
}

/** Internal driver features only; arbitrary error text is never copied to diagnostics. */
export function admissionErrorKind(error: unknown): AdmissionErrorKind {
  try {
    const e = typeof error === "object" && error !== null ? error as { code?: unknown; message?: unknown } : {};
    if (e.message === "Query read timeout") return "driver_read_timeout";
    if (e.code === "REQUEST_CANCELLED") return "cancelled";
    if (e.code === "REQUEST_DEADLINE_EXCEEDED" || e.code === "ADMISSION_WAIT_EXCEEDED") return "deadline";
    if (["ADMISSION_UNAVAILABLE", "DAILY_BUDGET_EXHAUSTED", "MONTHLY_BUDGET_EXHAUSTED"].includes(String(e.code))) return "admission_refused";
    if (sqlState(error)) return "database";
    if (["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE", "ENOTFOUND", "EAI_AGAIN"].includes(String(e.code)) ||
      e.message === "Connection terminated unexpectedly" || e.message === "Connection terminated") return "connection";
  } catch { /* Diagnostic inspection must preserve the original outcome. */ }
  return "unknown";
}

function observe(record: () => void) { try { record(); } catch { /* Diagnostics cannot change query results. */ } }

/** One checked-out connection per ordered batch. Waiting between phases owns no connection. */
export class PipelinedAdmissionDatabase implements AdmissionDatabase {
  private acquiring = 0;
  constructor(private readonly pool: AdmissionPool) {}

  async execute(phase: AdmissionPhase, values: readonly unknown[], signal: AbortSignal, remaining: () => number): Promise<AdmissionExecution> {
    const started = performance.now();
    const diagnostic: AdmissionDiagnostic = { phase, step: "acquire", acquireMs: 0, batchMs: 0, elapsedMs: 0,
      remainingMs: Math.max(0, Math.floor(remaining())), budgetMs: 0, maxWaitMs: Math.max(0, Math.floor(Math.min(600, remaining()))), committed: false, sqlState: null,
      readTimeoutMs: 0, statements: (["begin", "configure", "function", "commit"] as const).map(step => ({
        step, submittedMs: null, settledMs: null, status: "not_submitted", command: null, sqlState: null, errorKind: null })),
      functionToCommitMs: null, commitAck: "not_submitted", connectionDestroyed: false, errorKind: null };
    let client: AdmissionConnection | undefined, destroy = false, batchStarted: number | undefined;
    let socketFailed = false, socketError: unknown;
    const onConnectionError = (error: unknown) => { socketFailed = true; socketError = error; destroy = true; };
    try {
      throwIfAborted(signal);
      if (diagnostic.maxWaitMs < 1) throw new AdmissionError("ADMISSION_WAIT_EXCEEDED");
      // A cancelled/expired acquisition retains this slot until the underlying pool settles.
      if (this.acquiring >= 12) throw new AdmissionError("ADMISSION_UNAVAILABLE");
      this.acquiring++;
      const lease = Promise.resolve().then(() => this.pool.connect()).finally(() => { this.acquiring--; });
      const acquisition = createRequestContext(signal, diagnostic.maxWaitMs, new AdmissionError("ADMISSION_UNAVAILABLE"));
      try {
        client = await abortable(lease, acquisition.signal);
      } catch (error) {
        void lease.then(late => { try { late.release(); } catch { /* Detached cleanup must stay handled. */ } }, () => {});
        throw error;
      } finally { acquisition.dispose(); }
      // pg-pool removes its idle error listener while a client is checked out.
      client.on?.("error", onConnectionError);
      diagnostic.acquireMs = ms(performance.now() - started);
      throwIfAborted(signal);
      diagnostic.remainingMs = Math.max(0, Math.floor(remaining()));
      diagnostic.budgetMs = Math.min(800, diagnostic.remainingMs);
      if (diagnostic.budgetMs < 1) throw new AdmissionError("ADMISSION_WAIT_EXCEEDED");
      if (!client.pipeline) throw new AdmissionError("ADMISSION_UNAVAILABLE");
      const readTimeout = Math.min(1200, diagnostic.remainingMs);
      diagnostic.readTimeoutMs = readTimeout;
      const queries = [
        { text: "BEGIN" },
        { text: CONFIGURE, values: [String(diagnostic.budgetMs), String(Math.min(150, diagnostic.budgetMs))] },
        { text: SQL[phase], values: [...values, diagnostic.remainingMs] },
        { text: "COMMIT" },
      ];
      batchStarted = performance.now();
      const pending: Promise<AdmissionQueryResult>[] = [];
      try {
        // Enqueue the entire transaction before awaiting: pg sends it in order in one pipeline.
        for (const [index, query] of queries.entries()) {
          const entry = diagnostic.statements[index]!;
          diagnostic.step = entry.step;
          entry.submittedMs = ms(performance.now() - batchStarted);
          entry.status = "pending";
          try {
            pending.push(client.query({ ...query, query_timeout: readTimeout }).then(result => {
              observe(() => {
                entry.settledMs = ms(performance.now() - batchStarted!); entry.status = "fulfilled";
                if (["BEGIN", "SELECT", "COMMIT", "ROLLBACK"].includes(result.command)) entry.command = result.command as typeof entry.command;
              });
              return result;
            }, error => {
              observe(() => { entry.settledMs = ms(performance.now() - batchStarted!); entry.status = "rejected";
                entry.sqlState = sqlState(error); entry.errorKind = admissionErrorKind(error); });
              throw error;
            }));
          } catch (error) {
            observe(() => { entry.settledMs = ms(performance.now() - batchStarted!); entry.status = "rejected";
              entry.sqlState = sqlState(error); entry.errorKind = admissionErrorKind(error); });
            throw error;
          }
        }
      } catch (error) {
        destroy = true;
        await Promise.allSettled(pending);
        throw error;
      }
      const settled = await Promise.allSettled(pending);
      diagnostic.batchMs = ms(performance.now() - batchStarted);
      const commit = settled[3];
      const command = commit?.status === "fulfilled" ? commit.value.command : null;
      diagnostic.committed = command === "COMMIT";
      // ROLLBACK is a healthy, fully drained connection; a missing acknowledgement is ambiguous.
      destroy ||= command !== "COMMIT" && command !== "ROLLBACK";
      const failed = settled.findIndex(result => result.status === "rejected");
      if (failed >= 0) {
        diagnostic.step = diagnostic.statements[failed]!.step;
        throw (settled[failed] as PromiseRejectedResult).reason;
      }
      if (socketFailed) throw socketError;
      diagnostic.step = "commit";
      if (!diagnostic.committed) throw new AdmissionError("ADMISSION_UNAVAILABLE");
      throwIfAborted(signal);
      if (remaining() <= 0) throw new AdmissionError("ADMISSION_WAIT_EXCEEDED");
      diagnostic.step = "response";
      const fn = settled[2] as PromiseFulfilledResult<AdmissionQueryResult>;
      if (fn.value.rows.length !== 1) throw new AdmissionError("ADMISSION_UNAVAILABLE");
      diagnostic.elapsedMs = ms(performance.now() - started);
      diagnostic.remainingMs = Math.max(0, Math.floor(remaining()));
      return { value: fn.value.rows[0]!.result, diagnostic };
    } catch (error) {
      diagnostic.acquireMs = batchStarted === undefined ? ms(performance.now() - started) : diagnostic.acquireMs;
      diagnostic.batchMs = batchStarted === undefined ? 0 : ms(performance.now() - batchStarted);
      diagnostic.elapsedMs = ms(performance.now() - started);
      diagnostic.remainingMs = Math.max(0, Math.floor(remaining()));
      diagnostic.sqlState = sqlState(error);
      diagnostic.errorKind = admissionErrorKind(error);
      throw new AdmissionDatabaseError(diagnostic, error);
    } finally {
      observe(() => {
        const fn = diagnostic.statements[2]!, commit = diagnostic.statements[3]!;
        diagnostic.commitAck = commit.command === "COMMIT" ? "confirmed_commit" : commit.command === "ROLLBACK" ? "confirmed_rollback"
          : commit.submittedMs === null ? "not_submitted" : "unconfirmed";
        if (fn.status === "fulfilled" && fn.settledMs !== null && commit.settledMs !== null) {
          diagnostic.functionToCommitMs = ms(commit.settledMs - fn.settledMs);
        }
        diagnostic.connectionDestroyed = !!client && destroy;
      });
      try { client?.release(destroy); } catch { /* The completed batch must retain its original outcome. */ }
      finally { client?.removeListener?.("error", onConnectionError); }
    }
  }
}
