import { AdmissionError } from "./errors.js";
import { abortable, throwIfAborted } from "../amap/request-context.js";

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
export interface AdmissionDiagnostic {
  phase: AdmissionPhase;
  step: "acquire" | "configure" | "function" | "commit" | "response";
  acquireMs: number; batchMs: number; elapsedMs: number;
  remainingMs: number; budgetMs: number; maxWaitMs: number;
  committed: boolean; sqlState: string | null;
}
export interface AdmissionExecution { value: unknown; diagnostic: AdmissionDiagnostic; }
export interface AdmissionDatabase {
  execute(phase: AdmissionPhase, values: readonly unknown[], signal: AbortSignal, remaining: () => number): Promise<AdmissionExecution>;
}
export class AdmissionDatabaseError extends Error {
  constructor(readonly diagnostic: AdmissionDiagnostic, readonly original: unknown) { super("Admission database failure"); }
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

/** One checked-out connection per ordered batch. Waiting between phases owns no connection. */
export class PipelinedAdmissionDatabase implements AdmissionDatabase {
  private acquiring = 0;
  constructor(private readonly pool: AdmissionPool) {}

  async execute(phase: AdmissionPhase, values: readonly unknown[], signal: AbortSignal, remaining: () => number): Promise<AdmissionExecution> {
    const started = performance.now();
    const diagnostic: AdmissionDiagnostic = { phase, step: "acquire", acquireMs: 0, batchMs: 0, elapsedMs: 0,
      remainingMs: Math.max(0, Math.floor(remaining())), budgetMs: 0, maxWaitMs: Math.max(0, Math.floor(Math.min(600, remaining()))), committed: false, sqlState: null };
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
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new AdmissionError("ADMISSION_UNAVAILABLE")), diagnostic.maxWaitMs); });
        client = await abortable(Promise.race([lease, deadline]), signal);
      } catch (error) {
        void lease.then(late => { try { late.release(); } catch { /* Detached cleanup must stay handled. */ } }, () => {});
        throw error;
      } finally { clearTimeout(timer); }
      // pg-pool removes its idle error listener while a client is checked out.
      client.on?.("error", onConnectionError);
      diagnostic.acquireMs = ms(performance.now() - started);
      throwIfAborted(signal);
      diagnostic.remainingMs = Math.max(0, Math.floor(remaining()));
      diagnostic.budgetMs = Math.min(800, diagnostic.remainingMs);
      if (diagnostic.budgetMs < 1) throw new AdmissionError("ADMISSION_WAIT_EXCEEDED");
      if (!client.pipeline) throw new AdmissionError("ADMISSION_UNAVAILABLE");
      const readTimeout = Math.min(1200, diagnostic.remainingMs);
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
        for (const query of queries) pending.push(client.query({ ...query, query_timeout: readTimeout }));
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
        diagnostic.step = (["acquire", "configure", "function", "commit"] as const)[failed]!;
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
      throw new AdmissionDatabaseError(diagnostic, error);
    } finally {
      try { client?.release(destroy); } catch { /* The completed batch must retain its original outcome. */ }
      finally { client?.removeListener?.("error", onConnectionError); }
    }
  }
}
