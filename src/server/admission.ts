import "server-only";
import { createAdmission, PostgresAdmissionStore } from "../admission/service.js";
import { withAdmissionPreparation } from "../admission/prepare.js";
import { AdmissionError } from "../admission/errors.js";
import { throwIfAborted } from "../amap/request-context.js";

async function preparation() {
  const { getAdmissionRuntime } = await import("../db/prisma.js");
  return getAdmissionRuntime().readiness;
}
/** Shared entry for Node startup, CLI startup and lazy request preparation. */
export async function prepareServerAdmission(signal?: AbortSignal) {
  try { await (await preparation()).ensure(signal); }
  catch { throwIfAborted(signal); throw new AdmissionError("ADMISSION_UNAVAILABLE"); }
}

const hooks = new Map<string, ReturnType<typeof createAdmission>>();
export function getServerAdmission(credentialId: string) {
  let hook = hooks.get(credentialId);
  if (!hook) {
    hook = withAdmissionPreparation(createAdmission(async () => {
      const { getAdmissionRuntime } = await import("../db/prisma.js");
      return new PostgresAdmissionStore(getAdmissionRuntime().database);
    }, credentialId), preparation);
    hooks.set(credentialId, hook);
  }
  return hook;
}
