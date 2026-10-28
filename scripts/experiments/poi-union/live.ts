import { getServerAdmission } from "../../../src/server/admission.js";
import { getRequestPolicy } from "../../../src/server/request-policy.js";
import type { Runtime } from "./runner.js";

/** Loaded only after explicit CLI live authorization and validated local configuration. */
export function prepareLiveRuntime(): () => Promise<Runtime> {
  const key = process.env.AMAP_WEB_SERVICE_KEY;
  const credentialId = process.env.AMAP_CREDENTIAL_ID ?? "primary";
  if (!key?.trim() || !process.env.DATABASE_URL?.trim() || !credentialId.trim()) throw new Error("Missing live environment");
  const policy = getRequestPolicy();
  return async () => {
    // Uses the exact production hook, lazy DB store, pool and policy. No DB mutations beyond normal admission.
    const hook = getServerAdmission(credentialId);
    return { key, beforeAttempt: hook, fetchImpl: globalThis.fetch, policy, requestTimeoutMs: policy.requestTimeoutMs,
      async close() {
        const { getAdmissionPrisma, prisma } = await import("../../../src/db/prisma.js");
        await Promise.all([getAdmissionPrisma().$disconnect(), prisma.$disconnect()]);
      } };
  };
}
