import "server-only";
import { randomUUID } from "node:crypto";
import { prisma, getAdmissionRuntime } from "../db/prisma.js";
import { createAdmission, PostgresAdmissionStore, type AdmissionDatabase } from "../admission/service.js";
import { PipelinedAdmissionDatabase } from "../admission/database.js";
import type { BeforeAmapAttempt } from "../amap/transport.js";
import { withAdmissionPreparation } from "../admission/prepare.js";
import type { RequestIdentity } from "../identity/service.js";
import { accessMode } from "../identity/access-mode.js";

const executors = new WeakMap<object, PipelinedAdmissionDatabase>();

export function integerPolicy(name: string, fallback: number, max = 1000000) {
  const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error("Invalid identity policy");
  return value;
}
export function guestDailyLimit() { return integerPolicy("NEARBY_GUEST_DAILY_LIMIT", 60); }
export function identityAdmission(identity: RequestIdentity, credential: { id?: string; version?: number; fingerprint: string }, upstreamTimeoutMs: number): BeforeAmapAttempt {
  return async (operation, signal, context) => {
    const runtime = getAdmissionRuntime();
    const leaseId = randomUUID();
    const account = identity.kind === "account";
    const payload = JSON.stringify({ kind: identity.kind, accessMode: accessMode(), subject: account ? identity.userId : identity.guestId,
      sessionId: identity.sessionId, credentialId: credential.id, version: credential.version,
      fingerprint: credential.fingerprint, publicCredential: process.env.AMAP_CREDENTIAL_ID ?? "primary", leaseId,
      intervalMs: integerPolicy(account ? "NEARBY_ACCOUNT_INTERVAL_MS" : "NEARBY_GUEST_INTERVAL_MS", 500, 2000),
      dailyLimit: account ? undefined : guestDailyLimit(), maxConcurrent: integerPolicy("NEARBY_MAX_UPSTREAM_CONCURRENT", 12, 100), leaseMs: upstreamTimeoutMs + 5000 });
    let executor = executors.get(runtime.pool);
    if (!executor) { executor = new PipelinedAdmissionDatabase(runtime.pool, {
      reserve: "SELECT public.amap_admission_reserve_v2($1::jsonb,$2::text,$3::integer) AS result",
      grant: "SELECT public.amap_admission_grant_v2($1::jsonb,$2::text,$3::text,$4::integer,$5::bigint,$6::bigint,$7::integer) AS result",
    }); executors.set(runtime.pool, executor); }
    const sharedExecutor = executor;
    const database: AdmissionDatabase = { execute(phase, values, ...rest) { return sharedExecutor.execute(phase, [payload, ...values.slice(1)], ...rest); } };
    const before = withAdmissionPreparation(createAdmission(new PostgresAdmissionStore(database), "identity"), async () => runtime.readiness);
    const release = async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { await Promise.race([prisma.requestLease.deleteMany({ where: { id: leaseId } }).catch(() => {}), new Promise<void>(resolve => { timer = setTimeout(resolve, 200); })]); }
      finally { clearTimeout(timer); }
    };
    try {
      const permit = await before(operation, signal, context);
      return { assertValid() { permit?.assertValid(); }, release };
    } catch (error) {
      // Late COMMIT may create the lease after cancellation; TTL provides final recovery.
      await release();
      throw error;
    }
  };
}
