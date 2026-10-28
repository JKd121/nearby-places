import assert from "node:assert/strict";
import test from "node:test";
import { PostgresAdmissionStore, budgetPeriod, type AdmissionDatabase, type AdmissionSql, type Reservation } from "../src/admission/service.js";
import { AdmissionError } from "../src/admission/errors.js";
import { RequestTerminatedError } from "../src/amap/errors.js";

const secret = "SECRET-KEY postgresql://private:password@private-host/db?token=private 123.456789,34.567891";
type Phase = "reserve" | "grant";
function fixture(failStep?: string, error: unknown = Object.assign(Error(secret), { code: "P2028" })) {
  const now = Date.now(), period = budgetPeriod(new Date(now));
  const row: Record<string, unknown> = { id: secret, policyVersion: 1, enabled: true, dailyLimit: 100, monthlyLimit: 1000, intervalMs: 500, waitMs: 2000, graceMs: 800, permitTtlMs: 400,
    day: period.day, month: period.month, dayUsed: 0, monthUsed: 0, reservationMs: "0", consumedMs: "0", grantMs: "0" };
  const calls: { sql: string; values: unknown[] }[] = [];
  let transactions = 0;
  const options: { maxWait: number; timeout: number }[] = [];
  const names = ["transaction.configure", "resource.select", "binding.select", "clock.select"];
  const db: AdmissionDatabase = {
    async $transaction<T>(run: (tx: AdmissionSql) => Promise<T>, policy: { maxWait: number; timeout: number }): Promise<T> {
      transactions++; options.push(policy);
      if (failStep === "transaction.acquire") throw error;
      const result = await run({ async $queryRawUnsafe<T>(sql: string, ...values: unknown[]): Promise<T> {
        const step = names[calls.length] ?? "write";
        calls.push({ sql, values });
        if (step === failStep) throw error;
        return (step === "resource.select" ? [{ ...row }] : step === "binding.select" ? [{ resourceId: secret }] : step === "clock.select" ? [{ nowMs: String(now) }] : []) as T;
      } });
      if (failStep === "transaction.commit") throw error;
      return result;
    },
  };
  const store = new PostgresAdmissionStore(db);
  const ticket: Reservation = { resourceId: secret, version: 1, scheduledAt: new Date(now - 1), expiresAt: new Date(now + 1500), delayMs: 0, validForMs: 1500 };
  return { row, calls, options, transactions: () => transactions,
    run: (phase: Phase, signal = new AbortController().signal, remaining = () => 2000) => phase === "reserve" ? store.reserve(secret, "nearby", signal, remaining) : store.grant(secret, "nearby", ticket, signal, remaining) };
}
const unavailable = (error: unknown) => error instanceof AdmissionError && error.code === "ADMISSION_UNAVAILABLE";

test("transaction failures identify reserve/grant and the exact last stage once", async t => {
  const logs: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  for (const phase of ["reserve", "grant"] as const) {
    for (const step of ["transaction.acquire", "transaction.configure", "resource.select", "binding.select", "clock.select", "write", "transaction.commit"]) {
      logs.length = 0; const f = fixture(step); await assert.rejects(f.run(phase), unavailable);
      assert.equal(logs.length, 1); assert.equal(logs[0]![0], "admission.failed");
      const data = logs[0]![1] as Record<string, unknown>;
      assert.equal(data.phase, phase); assert.equal(data.step, step === "write" ? phase === "reserve" ? "reservation.write" : "grant.write" : step);
      assert.equal(data.prismaCode, "P2028"); assert.equal(data.sqlState, null);
      assert.equal(data.budgetMs, 800); assert.equal(data.maxWaitMs, 600);
      assert.ok(Number(data.elapsedMs) >= 0 && Number(data.stepElapsedMs) >= 0 && Number(data.stepElapsedMs) <= Number(data.elapsedMs));
      assert.equal(f.transactions(), 1); assert.ok(!JSON.stringify(logs).includes(secret));
    }
  }
});

test("successful transactions log nothing and retain SQL order, parameters and budgets", async t => {
  let logs = 0; t.mock.method(console, "error", () => { logs++; });
  for (const phase of ["reserve", "grant"] as const) {
    const f = fixture(); await f.run(phase);
    assert.equal(f.calls.length, 5); assert.equal(f.transactions(), 1);
    assert.match(f.calls[0]!.sql, /set_config/); assert.deepEqual(f.calls[0]!.values, ["800", "150"]);
    assert.match(f.calls[1]!.sql, /FOR UPDATE/); assert.match(f.calls[2]!.sql, /FOR SHARE/);
    assert.match(f.calls[3]!.sql, /clock_timestamp/); assert.match(f.calls[4]!.sql, /^UPDATE/);
    assert.deepEqual(f.options, [{ maxWait: 600, timeout: 800 }]);
  }
  assert.equal(logs, 0);
});

test("structured Prisma/SQLSTATE codes are extracted without messages, SQL or identifiers", async t => {
  const logs: unknown[][] = []; t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  for (const meta of [{ code: "55P03", query: secret }, { driverAdapterError: { cause: { originalCode: "57014", message: secret } } }]) {
    const error = Object.assign(Error(secret), { code: "P2010", meta, stack: secret });
    await assert.rejects(fixture("resource.select", error).run("reserve"), unavailable);
  }
  const first = logs[0]![1] as Record<string, unknown>, second = logs[1]![1] as Record<string, unknown>;
  assert.equal(first.sqlState, "55P03"); assert.equal(second.sqlState, "57014"); assert.equal(first.prismaCode, "P2010");
  assert.deepEqual(Object.keys(first).sort(), ["phase", "step", "elapsedMs", "stepElapsedMs", "budgetMs", "maxWaitMs", "prismaCode", "sqlState", "admissionCode"].sort());
  for (const forbidden of [secret, "postgresql://", "private-host", "123.456789", "password"]) assert.ok(!JSON.stringify(logs).includes(forbidden));
});

test("invalid free-form codes are omitted; controlled errors preserve their identity", async t => {
  const logs: unknown[][] = []; t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  await assert.rejects(fixture("resource.select", { code: secret, meta: { code: "TOKEN" }, message: secret }).run("reserve"), unavailable);
  assert.equal((logs[0]![1] as Record<string, unknown>).prismaCode, null); assert.equal((logs[0]![1] as Record<string, unknown>).sqlState, null);
  const original = new AdmissionError("ADMISSION_WAIT_EXCEEDED");
  await assert.rejects(fixture("resource.select", original).run("reserve"), error => error === original);
  assert.equal((logs[1]![1] as Record<string, unknown>).admissionCode, original.code);
});

test("local resource validation and budget failures have fixed non-SQL labels", async t => {
  const logs: unknown[][] = []; t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  const invalid = fixture(); invalid.row.enabled = false;
  await assert.rejects(invalid.run("reserve"), unavailable);
  assert.equal((logs[0]![1] as Record<string, unknown>).step, "resource.validate");
  const exhausted = fixture(); exhausted.row.dayUsed = exhausted.row.dailyLimit;
  await assert.rejects(exhausted.run("grant"), (e: unknown) => e instanceof AdmissionError && e.code === "DAILY_BUDGET_EXHAUSTED");
  assert.equal((logs[1]![1] as Record<string, unknown>).step, "budget.check"); assert.equal(exhausted.calls.length, 4);
});

test("cancelled and expired callers preserve existing terminal behavior", async t => {
  const logs: unknown[][] = []; t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  const controller = new AbortController(); const reason = new RequestTerminatedError("REQUEST_CANCELLED"); controller.abort(reason);
  const cancelled = fixture(); await assert.rejects(cancelled.run("reserve", controller.signal), error => error === reason);
  assert.equal(cancelled.transactions(), 0); assert.equal(logs.length, 0);
  const expired = fixture(); await assert.rejects(expired.run("reserve", undefined, () => 0), (e: unknown) => e instanceof AdmissionError && e.code === "ADMISSION_WAIT_EXCEEDED");
  assert.equal(expired.transactions(), 0); assert.equal(logs.length, 1);
});

test("a throwing log sink preserves original mapping and does not retry", async t => {
  t.mock.method(console, "error", () => { throw Error("broken log sink"); });
  const f = fixture("resource.select"); await assert.rejects(f.run("reserve"), unavailable);
  assert.equal(f.transactions(), 1); assert.equal(f.calls.length, 2);
});
