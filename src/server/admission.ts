import "server-only";
import { createAdmission, PostgresAdmissionStore } from "../admission/service.js";

const hooks = new Map<string, ReturnType<typeof createAdmission>>();
export function getServerAdmission(credentialId: string) {
  let hook = hooks.get(credentialId);
  if (!hook) {
    hook = createAdmission(async () => {
      const { getAdmissionPrisma } = await import("../db/prisma.js");
      return new PostgresAdmissionStore(getAdmissionPrisma());
    }, credentialId);
    hooks.set(credentialId, hook);
  }
  return hook;
}
