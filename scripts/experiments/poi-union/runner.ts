import { createAmapTransport, type BeforeAmapAttempt, type TransportPolicy } from "../../../src/amap/transport.js";
import { createRequestContext, throwIfAborted } from "../../../src/amap/request-context.js";
import { AmapApiError, safeErrorDiagnostic } from "../../../src/amap/errors.js";
import { AdmissionError } from "../../../src/admission/errors.js";
import { classifyError } from "../../../src/errors/classify.js";
import { CATEGORIES } from "../../../src/amap/categories.js";
import { buildUrl, FIXED, MAX_CALLS, SORT_COMPARISON_CALLS, parseConfig, plan, sortComparisonPlan, statistics, type Config, type Mode } from "./model.js";
import type { Report, Result } from "./report.js";

export interface Runtime {
  key: string;
  beforeAttempt: BeforeAmapAttempt;
  fetchImpl: typeof fetch;
  policy?: TransportPolicy;
  requestTimeoutMs?: number;
  beforeHttp?(): void;
  close?(): Promise<void>;
}
export interface RunOptions {
  mode: Mode;
  /** Explicitly selected by the separate local exploration CLI only. */
  executionControl?: "local-exploration";
  design?: "sort-comparison";
  config: Config;
  signal?: AbortSignal;
  createRuntime?: () => Promise<Runtime>;
  checkpoint: (report: Report) => void;
}
const ms = (start: number) => Math.round((performance.now() - start) * 100) / 100;

export function mockRuntime(config: Config, comparison = false): Runtime {
  let n = 0;
  const trials = comparison ? sortComparisonPlan(config) : plan(config);
  return { key: "synthetic-key", beforeAttempt: async () => ({ assertValid() {} }),
    fetchImpl: async () => {
      const trial = trials[n++]!;
      const densityIndex = ["low", "medium", "high"].indexOf(trial.density);
      const codes = trial.categories.flatMap(k => CATEGORIES.find(c => c.key === k)!.types);
      const total = Math.min(FIXED.pageSize, codes.length * (densityIndex + 1) + 2);
      const pois = Array.from({ length: total }, (_, i) => ({ typecode: i === total - 1 ? "150701" : i === total - 2 ? "999999" : codes[i % codes.length] }));
      return Response.json({ status: "1", infocode: "10000", pois });
    } };
}

export async function runExperiment(options: RunOptions): Promise<Report> {
  const config = parseConfig(options.config);
  const comparison = options.design === "sort-comparison";
  const trials = comparison ? sortComparisonPlan(config) : plan(config);
  const limit = comparison ? SORT_COMPARISON_CALLS : MAX_CALLS;
  if (!["dry", "mock", "live"].includes(options.mode) || trials.length !== limit || comparison && options.executionControl !== "local-exploration") throw new Error("Invalid experiment mode or budget");
  const report: Report = { version: comparison ? "poi-union-sort-v1" : "poi-union-v1", mode: options.mode, generatedAt: new Date().toISOString(), radiusMeters: config.radiusMeters,
    state: options.mode === "dry" ? "planned" : "running", plannedCalls: trials.length, hardLimit: limit, httpCalls: 0, simulatedCalls: 0, skippedTrials: trials.length, results: [] };
  if (options.executionControl) report.executionControl = options.executionControl;
  options.checkpoint(report); // Storage must work before any admission/HTTP.
  let runtime: Runtime | undefined;
  let totalCalls = 0;
  try {
    for (const [index, trial] of trials.entries()) {
      const row: Result = { trial, outcome: "planned", admission: "not-attempted", httpCalls: 0, simulatedCalls: 0, httpStatus: null,
        businessStatus: "unavailable", infocode: null, errorCode: null, errorAction: null, elapsedMs: null, admissionMs: null, responseMs: null, stats: null };
      if (options.mode !== "dry") {
        const start = performance.now();
        let httpStart: number | undefined;
        let localGuardFailed = false;
        let context: ReturnType<typeof createRequestContext> | undefined;
        try {
          throwIfAborted(options.signal);
          runtime ??= options.mode === "mock" ? await (options.createRuntime?.() ?? Promise.resolve(mockRuntime(config, comparison))) : await options.createRuntime?.();
          if (!runtime?.key.trim() || typeof runtime.beforeAttempt !== "function" || typeof runtime.fetchImpl !== "function") throw new Error("Missing guarded runtime");
          const current = runtime;
          context = createRequestContext(options.signal, current.requestTimeoutMs ?? 60000);
          const transport = createAmapTransport(async (url, init) => {
            // This callback is invoked only by transport, after admission and permit.assertValid().
            if (row.admission !== (options.executionControl ? "local-budget" : "granted") || totalCalls >= limit || row.httpCalls + row.simulatedCalls !== 0) throw new Error("HTTP budget violation");
            throwIfAborted(context?.signal);
            try { current.beforeHttp?.(); } // Durable ledger update must succeed BEFORE issuing HTTP.
            catch (error) { localGuardFailed = true; throw error; }
            totalCalls++;
            if (options.mode === "live") { row.httpCalls++; report.httpCalls++; }
            else { row.simulatedCalls++; report.simulatedCalls++; }
            httpStart = performance.now();
            const response = await current.fetchImpl(url, init);
            row.httpStatus = response.status;
            return response;
          }, { ...(current.policy ? { policy: current.policy } : {}), context,
            beforeAttempt: async (...args) => {
              if (totalCalls >= limit) throw new Error("Global HTTP budget exhausted");
              const admissionStart = performance.now();
              try {
                const permit = await current.beforeAttempt(...args);
                if (!permit || typeof permit.assertValid !== "function") throw new AdmissionError("ADMISSION_UNAVAILABLE");
                row.admission = options.executionControl ? "local-budget" : "granted";
                return permit;
              }
              catch (error) { row.admission = "failed"; throw error; }
              finally { row.admissionMs = ms(admissionStart); }
            } });
          const payload = await transport.requestJson(buildUrl(current.key, config.locations[Math.floor(index / (comparison ? 2 : 3))]!, config.radiusMeters, trial), "nearby", context);
          if (httpStart !== undefined) row.responseMs = ms(httpStart);
          row.businessStatus = "1";
          row.infocode = typeof payload.infocode === "string" && /^\d{5,6}$/.test(payload.infocode) ? payload.infocode : null;
          row.stats = statistics(payload);
          row.outcome = "success";
        } catch (error) {
          const safe = safeErrorDiagnostic(error);
          row.errorCode = safe.code;
          row.errorAction = classifyError(error);
          if (localGuardFailed) { row.errorCode = "INTERNAL_ERROR"; row.errorAction = "fatal"; }
          if (["ADMISSION_UNAVAILABLE", "ADMISSION_WAIT_EXCEEDED", "DAILY_BUDGET_EXHAUSTED", "MONTHLY_BUDGET_EXHAUSTED"].includes(safe.code)) row.admission = "failed";
          row.infocode = safe.infocode ?? row.infocode;
          if (row.httpStatus !== null && row.httpStatus >= 200 && row.httpStatus < 300 && error instanceof AmapApiError && ["UPSTREAM_BUSINESS", "UPSTREAM_AUTH_FAILED"].includes(error.code)) row.businessStatus = "non-success";
          row.outcome = "failed";
          if (httpStart !== undefined && row.responseMs === null) row.responseMs = ms(httpStart);
          // Local exploration skips ordinary upstream failures; the original V1 still stops on any failure.
          // Provider quota/rate-limit codes are experiment-only stop conditions, not a production classifier change.
          // https://lbs.amap.com/api/webservice/guide/tools/info
          const limited = ["10003", "10004", "10010", "10014", "10015", "10019", "10020", "10021", "10029", "10044", "10045", "40000", "40002", "40003"].includes(safe.infocode ?? "") || row.httpStatus === 429;
          if (!options.executionControl || row.errorAction !== "recover" || limited) report.state = "stopped";
        } finally { row.elapsedMs = ms(start); context?.dispose(); }
      }
      report.results.push(row);
      report.skippedTrials = options.mode === "dry" ? trials.length : trials.length - report.results.length;
      options.checkpoint(report);
      if (report.state === "stopped") break;
    }
    if (report.state === "running") report.state = "completed";
    options.checkpoint(report);
    return report;
  } finally { await runtime?.close?.(); }
}
