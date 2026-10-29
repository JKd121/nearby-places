import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { PostgresAdmissionStore, createAdmission, type Reservation, type AdmissionTrace } from "../src/admission/service.js";
import { admissionErrorKind, PipelinedAdmissionDatabase, type AdmissionConnection, type AdmissionQueryResult, type AdmissionDiagnostic } from "../src/admission/database.js";
import { AdmissionError } from "../src/admission/errors.js";
import { cancellableDelay } from "../src/amap/request-context.js";

const secret = "PRIVATE_CREDENTIAL_AND_SQL";
const signal = new AbortController().signal, remaining = () => 2000;
const ticket: Reservation = { resourceId: secret, version: 1, scheduledAt: new Date(1000), expiresAt: new Date(2000), delayMs: 0, validForMs: 1000 };
const reservation = { code: "OK", resourceId: secret, version: 1, scheduledAtMs: 1000, expiresAtMs: 2000, delayMs: 0, validForMs: 1000 };
const unavailable = (e: unknown) => e instanceof AdmissionError && e.code === "ADMISSION_UNAVAILABLE";
type FailureLog = AdmissionDiagnostic & { attemptId: string | null; operation: string; admissionCode: string | null };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function fixture(options: { fail?: number; error?: unknown; commit?: string; value?: unknown; hold?: Promise<void>; commitHold?: Promise<void>; pipeline?: boolean } = {}) {
  const queries: { text: string; values?: unknown[]; query_timeout?: number }[] = [], released: boolean[] = [];
  const pending: { resolve(value: AdmissionQueryResult): void; reject(error: unknown): void }[] = [];
  const connection: AdmissionConnection = {
    pipeline: options.pipeline ?? true,
    query(query) {
      queries.push(query);
      const result = new Promise<AdmissionQueryResult>((resolve, reject) => { pending.push({ resolve, reject }); });
      // All four must be queued before any resolves: per-query awaiting deadlocks this fixture.
      if (queries.length === 4) void (options.hold ?? Promise.resolve()).then(() => {
        for (let i = 0; i < 4; i++) {
          const settle = () => {
            if (i === options.fail) pending[i]!.reject(options.error ?? Object.assign(Error(secret), { code: "57014" }));
            else pending[i]!.resolve({ command: i === 0 ? "BEGIN" : i === 3 ? options.commit ?? (options.fail === undefined ? "COMMIT" : "ROLLBACK") : "SELECT",
              rows: i === 2 ? [{ result: options.value ?? reservation }] : [] });
          };
          if (i === 3 && options.commitHold) void options.commitHold.then(settle); else settle();
        }
      });
      return result;
    },
    release(destroy = false) { released.push(destroy); },
  };
  const executor = new PipelinedAdmissionDatabase({ async connect() { return connection; } });
  return { store: new PostgresAdmissionStore(executor), executor, queries, released, connection };
}

test("successful phases enqueue one ordered batch with existing limits and log nothing", { timeout: 2000 }, async t => {
  const logs: unknown[] = []; t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  for (const phase of ["reserve", "grant"] as const) {
    const f = fixture({ value: phase === "reserve" ? reservation : { code: "OK", validForMs: 400 } });
    if (phase === "reserve") assert.equal((await f.store.reserve(secret, "nearby", signal, remaining)).resourceId, secret);
    else assert.equal((await f.store.grant(secret, "nearby", ticket, signal, remaining)).validForMs, 400);
    assert.equal(f.queries.length, 4); assert.equal(f.queries[0]!.text, "BEGIN"); assert.equal(f.queries[3]!.text, "COMMIT");
    assert.ok(f.queries[2]!.text.includes("amap_admission_" + phase + "_v1"));
    assert.deepEqual(f.queries[1]!.values, ["800", "150"]); assert.equal(f.queries[2]!.values!.at(-1), 2000);
    assert.ok(f.queries.every(q => q.query_timeout === 1200)); assert.deepEqual(f.released, [false]);
  }
  assert.equal(logs.length, 0);
});

test("SQL and acknowledgement failures emit one safe diagnostic and no permit", async t => {
  const logs: unknown[][] = []; t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  for (const fail of [0, 1, 2, 3]) {
    const f = fixture({ fail }); await assert.rejects(f.store.reserve(secret, "nearby", signal, remaining), unavailable);
    const data = logs.at(-1)![1] as Record<string, unknown>;
    assert.equal(data.step, ["begin", "configure", "function", "commit"][fail]); assert.equal(data.sqlState, "57014");
    assert.equal(data.committed, false); assert.deepEqual(f.released, [fail === 3]);
    const detailed = data as unknown as FailureLog;
    assert.equal(detailed.errorKind, "database"); assert.equal(detailed.statements[fail]!.sqlState, "57014");
    assert.equal(detailed.commitAck, fail === 3 ? "unconfirmed" : "confirmed_rollback");
  }
  assert.equal(logs.length, 4); assert.ok(!JSON.stringify(logs).includes(secret));
  assert.deepEqual(Object.keys(logs[0]![1] as object).sort(), ["phase", "step", "acquireMs", "batchMs", "elapsedMs", "remainingMs", "budgetMs", "maxWaitMs", "committed", "sqlState", "admissionCode", "readTimeoutMs", "statements", "functionToCommitMs", "commitAck", "connectionDestroyed", "errorKind", "attemptId", "operation"].sort());
});

test("COMMIT read timeout reports earlier results, acknowledgement uncertainty and safe timing", async t => {
  const logs: unknown[][] = []; t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  const f = fixture({ fail: 3, error: Error("Query read timeout") });
  await assert.rejects(f.store.reserve(secret, "nearby", signal, remaining), unavailable);
  assert.equal(logs.length, 1);
  const data = logs[0]![1] as FailureLog;
  assert.equal(data.step, "commit"); assert.equal(data.errorKind, "driver_read_timeout");
  assert.equal(data.readTimeoutMs, 1200); assert.equal(data.commitAck, "unconfirmed");
  assert.equal(data.committed, false); assert.equal(data.connectionDestroyed, true);
  assert.deepEqual(data.statements.map(s => s.step), ["begin", "configure", "function", "commit"]);
  assert.deepEqual(data.statements.map(s => s.status), ["fulfilled", "fulfilled", "fulfilled", "rejected"]);
  assert.deepEqual(data.statements.map(s => s.command), ["BEGIN", "SELECT", "SELECT", null]);
  for (const s of data.statements) { assert.ok(s.submittedMs !== null && s.submittedMs >= 0); assert.ok(s.settledMs !== null && s.settledMs >= s.submittedMs); }
  assert.ok(data.functionToCommitMs !== null && data.functionToCommitMs >= 0);
  assert.ok(!JSON.stringify(logs).includes(secret));
});

test("ROLLBACK and malformed function payloads fail closed", async t => {
  t.mock.method(console, "error", () => {});
  for (const options of [{ commit: "ROLLBACK" }, { value: {} }, { value: { ...reservation, scheduledAtMs: "1000" } },
    { value: { ...reservation, expiresAtMs: 999 } }, { value: { ...reservation, validForMs: 2001 } }, { value: { code: secret } }]) {
    await assert.rejects(fixture(options).store.reserve(secret, "nearby", signal, remaining), unavailable);
  }
});

test("controlled function outcomes retain codes and validate retryAt", async t => {
  const logs: unknown[][] = []; t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  for (const code of ["ADMISSION_WAIT_EXCEEDED", "ADMISSION_UNAVAILABLE", "DAILY_BUDGET_EXHAUSTED", "MONTHLY_BUDGET_EXHAUSTED"]) {
    const f = fixture({ value: { code, retryAt: "2026-11-01T00:00:00.000Z" } });
    await assert.rejects(f.store.reserve(secret, "nearby", signal, remaining), (e: unknown) => e instanceof AdmissionError && e.code === code && e.retryAt === "2026-11-01T00:00:00.000Z");
  }
  await assert.rejects(fixture({ value: { code: "DAILY_BUDGET_EXHAUSTED", retryAt: secret } }).store.reserve(secret, "nearby", signal, remaining), unavailable);
  assert.ok(!JSON.stringify(logs).includes(secret));
  assert.deepEqual(await fixture({ value: { code: "WAIT", delayMs: 20 } }).store.grant(secret, "nearby", ticket, signal, remaining), { delayMs: 20 });
});

test("unknown codes and a throwing log sink retain safe mapping without retry", async t => {
  const logs: unknown[][] = []; const sink = t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  await assert.rejects(fixture({ fail: 2, error: { code: secret, message: secret } }).store.reserve(secret, "nearby", signal, remaining), unavailable);
  assert.equal((logs[0]![1] as Record<string, unknown>).sqlState, null);
  sink.mock.mockImplementation(() => { throw Error(secret); }); const f = fixture({ fail: 2 });
  await assert.rejects(f.store.reserve(secret, "nearby", signal, remaining), unavailable); assert.equal(f.queries.length, 4);
});

test("pre-cancelled, exhausted and non-pipelined calls start no SQL", async t => {
  t.mock.method(console, "error", () => {});
  const parent = new AbortController(); parent.abort(); const f = fixture();
  await assert.rejects(f.store.reserve(secret, "nearby", parent.signal, remaining), (e: unknown) => (e as { code: string }).code === "REQUEST_CANCELLED");
  await assert.rejects(f.store.reserve(secret, "nearby", signal, () => 0)); assert.equal(f.queries.length, 0);
  const ordinary = fixture({ pipeline: false }); await assert.rejects(ordinary.store.reserve(secret, "nearby", signal, remaining), unavailable);
  assert.equal(ordinary.queries.length, 0); assert.deepEqual(ordinary.released, [false]);
});

test("cancellation during a batch retains the lease until all results drain", async t => {
  const logs: unknown[][] = []; t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  const hold = deferred<void>(), parent = new AbortController(), f = fixture({ hold: hold.promise });
  const pending = createAdmission(f.store, secret)("nearby", parent.signal);
  await cancellableDelay(0); assert.equal(f.queries.length, 4); parent.abort(); await assert.rejects(pending);
  assert.deepEqual(f.released, []); hold.resolve(); await cancellableDelay(0); assert.deepEqual(f.released, [false]);
  assert.equal(logs.length, 1);
  const data = logs[0]![1] as FailureLog;
  assert.equal(data.errorKind, "cancelled"); assert.equal(data.commitAck, "confirmed_commit");
  assert.equal(data.connectionDestroyed, false); assert.ok(data.statements.every(s => s.status === "fulfilled"));
});

test("cancelled acquisitions stay capped until late connections are released exactly once", async t => {
  t.mock.method(console, "error", () => {});
  const lease = deferred<AdmissionConnection>(); let count = 0, releases = 0;
  const connection: AdmissionConnection = { pipeline: true, async query() { throw Error("Unexpected SQL"); }, release() { releases++; } };
  const store = new PostgresAdmissionStore(new PipelinedAdmissionDatabase({ connect() { count++; return lease.promise; } }));
  for (let i = 0; i < 12; i++) {
    const parent = new AbortController(), pending = store.reserve(secret, "nearby", parent.signal, remaining);
    await cancellableDelay(0); parent.abort(); await assert.rejects(pending);
  }
  await assert.rejects(store.reserve(secret, "nearby", signal, remaining), unavailable); assert.equal(count, 12);
  lease.resolve(connection); await cancellableDelay(0); assert.equal(releases, 12);
});

test("acquisition deadlines own late cleanup; dispatch respects remaining time", async t => {
  t.mock.method(console, "error", () => {});
  const lease = deferred<AdmissionConnection>(), f = fixture();
  const store = new PostgresAdmissionStore(new PipelinedAdmissionDatabase({ connect: () => lease.promise }));
  await assert.rejects(store.reserve(secret, "nearby", signal, () => 15), unavailable);
  lease.resolve(f.connection); await cancellableDelay(0); assert.deepEqual(f.released, [false]); assert.equal(f.queries.length, 0);
  const limited = fixture(); await limited.store.reserve(secret, "nearby", signal, () => 100);
  assert.deepEqual(limited.queries[1]!.values, ["100", "100"]); assert.equal(limited.queries[0]!.query_timeout, 100);
  const execution = await fixture().executor.execute("reserve", [secret, "nearby"], signal, () => 100);
  assert.equal(execution.diagnostic.readTimeoutMs, 100); assert.equal(execution.diagnostic.commitAck, "confirmed_commit");
});

test("a synchronous enqueue failure drains prior promises and destroys the partial transaction", async t => {
  const logs: unknown[][] = []; t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  let calls = 0; const releases: boolean[] = [];
  const connection: AdmissionConnection = { pipeline: true, query() {
    if (++calls === 2) throw Error(secret);
    return Promise.resolve({ command: "BEGIN", rows: [] });
  }, release(destroy = false) { releases.push(destroy); } };
  const store = new PostgresAdmissionStore(new PipelinedAdmissionDatabase({ async connect() { return connection; } }));
  await assert.rejects(store.reserve(secret, "nearby", signal, remaining), unavailable);
  assert.equal(calls, 2); assert.deepEqual(releases, [true]);
  const data = logs[0]![1] as FailureLog;
  assert.equal(data.step, "configure"); assert.equal(data.commitAck, "not_submitted");
  assert.equal(data.connectionDestroyed, true);
  assert.deepEqual(data.statements.map(s => s.status), ["fulfilled", "rejected", "not_submitted", "not_submitted"]);
  assert.equal(data.functionToCommitMs, null); assert.ok(!JSON.stringify(logs).includes(secret));
});

test("function-to-COMMIT timing measures client-observed return separation", async () => {
  const hold = deferred<void>(), f = fixture({ commitHold: hold.promise });
  const pending = f.executor.execute("reserve", [secret, "nearby"], signal, remaining);
  await cancellableDelay(25); hold.resolve();
  const { diagnostic: data } = await pending;
  assert.ok(data.functionToCommitMs !== null && data.functionToCommitMs >= 15);
  assert.equal(data.functionToCommitMs, Math.round((data.statements[3]!.settledMs! - data.statements[2]!.settledMs!) * 100) / 100);
});

test("socket errors preserve confirmed COMMIT and request connection destruction", async t => {
  const logs: unknown[][] = []; t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  const hold = deferred<void>(), f = fixture({ hold: hold.promise });
  let notify!: (error: unknown) => void, removed = false;
  f.connection.on = (_event, listener) => { notify = listener; };
  f.connection.removeListener = (_event, listener) => { assert.equal(listener, notify); removed = true; };
  const pending = f.store.reserve(secret, "nearby", signal, remaining);
  await cancellableDelay(0); notify(Object.assign(Error(secret), { code: "ECONNRESET" })); hold.resolve();
  await assert.rejects(pending, unavailable);
  const data = logs[0]![1] as FailureLog;
  assert.equal(data.errorKind, "connection"); assert.equal(data.commitAck, "confirmed_commit");
  assert.equal(data.committed, true); assert.equal(data.connectionDestroyed, true); assert.equal(removed, true);
  assert.deepEqual(f.released, [true]); assert.equal(logs.length, 1); assert.ok(!JSON.stringify(logs).includes(secret));
});

test("diagnostic result inspection failures leave query results and releases intact", async () => {
  const f = fixture(); const query = f.connection.query;
  f.connection.query = async config => {
    const result = await query(config);
    if (config.text === "BEGIN") Object.defineProperty(result, "command", { get() { throw Error(secret); } });
    return result;
  };
  assert.equal((await f.store.reserve(secret, "nearby", signal, remaining)).resourceId, secret);
  assert.deepEqual(f.released, [false]); assert.equal(f.queries.length, 4);
});

test("error labels use fixed driver features and tolerate hostile inspection", () => {
  const samples = [[Error("Query read timeout"), "driver_read_timeout"], [{ code: "57P01" }, "database"],
    [{ code: "ECONNREFUSED", message: secret }, "connection"], [{ code: "REQUEST_CANCELLED" }, "cancelled"],
    [{ code: "REQUEST_DEADLINE_EXCEEDED" }, "deadline"], [new AdmissionError("DAILY_BUDGET_EXHAUSTED"), "admission_refused"],
    [{ message: secret, code: secret }, "unknown"], [Object.defineProperty({}, "code", { get() { throw Error(secret); } }), "unknown"]] as const;
  for (const [error, expected] of samples) assert.equal(admissionErrorKind(error), expected);
});

test("one admission trace links reserve and repeated grant calls and stays unique per attempt", async t => {
  const logs: unknown[][] = []; t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  const calls: { phase: string; trace: AdmissionTrace | undefined }[] = [];
  const store = new PostgresAdmissionStore(fixture().executor);
  t.mock.method(store, "reserve", async (...[_credential, _operation, _signal, _remaining, trace]: Parameters<PostgresAdmissionStore["reserve"]>) => {
    calls.push({ phase: "reserve", trace }); return ticket;
  });
  t.mock.method(store, "grant", async (...[_credential, _operation, _ticket, _signal, _remaining, trace]: Parameters<PostgresAdmissionStore["grant"]>) => {
    calls.push({ phase: "grant", trace });
    if (calls.length === 2) return { delayMs: 1 };
    return { validForMs: 400 };
  });
  const hook = createAdmission(store, secret);
  (await hook("nearby", signal))!.assertValid();
  assert.deepEqual(calls.map(c => c.phase), ["reserve", "grant", "grant"]);
  const first = calls[0]!.trace!.attemptId; assert.match(first, /^[0-9a-f-]{36}$/);
  assert.ok(calls.every(c => c.trace?.attemptId === first));
  (await hook("nearby", signal))!.assertValid(); assert.notEqual(calls[3]!.trace!.attemptId, first);
  const failing = fixture({ fail: 3, error: Error("Query read timeout") });
  await assert.rejects(createAdmission(failing.store, secret)("nearby", signal), unavailable);
  const data = logs[0]![1] as FailureLog; assert.match(data.attemptId!, /^[0-9a-f-]{36}$/); assert.equal(data.operation, "nearby");
  assert.equal(logs.length, 1); assert.ok(!JSON.stringify(logs).includes(secret));
});

test("startup/API module copies preserve database diagnostics and controlled admission codes", async t => {
  const logs: unknown[][] = []; t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  const diagnostic = { phase: "reserve", step: "function", acquireMs: 1, batchMs: 12, elapsedMs: 13,
    remainingMs: 1987, budgetMs: 800, maxWaitMs: 600, committed: false, sqlState: "42883" };
  for (const controlled of [false, true]) {
    const foreign = runInNewContext(`new (class extends Error {
      constructor() {
        super("PRIVATE_STARTUP_ERROR");
        this[Symbol.for("nearby.admission.database.error.v1")] = true;
        this.diagnostic = diagnostic;
        this.original = controlled ? Object.assign(new Error("PRIVATE_INNER_ERROR"), { name: "AdmissionError", code: "ADMISSION_WAIT_EXCEEDED" }) : { code: "42883" };
      }
    })()`, { diagnostic, controlled });
    const store = new PostgresAdmissionStore({ async execute() { throw foreign; } });
    await assert.rejects(store.reserve(secret, "nearby", signal, remaining), (e: unknown) => e instanceof AdmissionError && e.code === (controlled ? "ADMISSION_WAIT_EXCEEDED" : "ADMISSION_UNAVAILABLE"));
    const data = logs.at(-1)![1] as Record<string, unknown>;
    assert.equal(data.sqlState, "42883"); assert.equal(data.step, "function"); assert.equal(data.batchMs, 12); assert.equal(data.budgetMs, 800);
  }
  assert.ok(!JSON.stringify(logs).includes("PRIVATE_"));
});
