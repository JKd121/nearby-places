import "server-only";
import { prisma } from "../db/prisma.js";
import { resolveRequestIdentity } from "../identity/service.js";
import { loadCredential } from "../identity/credentials.js";
import { fingerprint, IdentityError, trustedIp, trustedOrigin } from "../identity/security.js";
import { requireRate } from "../identity/rate.js";
import { identityAdmission } from "./identity-admission.js";
import { AmapApiError } from "../amap/errors.js";
import type { AmapTransportOptions, BeforeAmapAttempt } from "../amap/transport.js";

export interface ServerAmapAccess { key: string; options: Pick<AmapTransportOptions, "onSuccess" | "mapError"> & { beforeAttempt: BeforeAmapAttempt }; }
export async function resolveAmapAccess(request: Request, timeout: number): Promise<ServerAmapAccess> {
  trustedOrigin(request);
  const identity = await resolveRequestIdentity(request);
  if (identity.kind === "guest") {
    await requireRate("guest-request:" + trustedIp(request.headers), 10, 100);
    const key = process.env.AMAP_WEB_SERVICE_KEY;
    if (!key?.trim()) throw new IdentityError("SERVICE_UNAVAILABLE", 503, "体验服务暂不可用");
    return { key, options: { beforeAttempt: identityAdmission(identity, { fingerprint: fingerprint(key) }, timeout) } };
  }
  if (process.env.NEARBY_ACCOUNT_SEARCH_ENABLED === "false") throw new IdentityError("ACCOUNT_SEARCH_DISABLED", 503, "账户搜索正在维护，请稍后再试");
  const { record, key } = await loadCredential(identity.userId);
  const update = async (status: string) => {
    try { await prisma.userApiCredential.updateMany({ where: { id: record.id, version: record.version }, data: { status, ...(status === "valid" ? { validatedAt: new Date() } : {}) } }); }
    catch { /* Status is advisory. Authorization always reads the credential version. */ }
  };
  return { key, options: { beforeAttempt: identityAdmission(identity, record, timeout),
    onSuccess: async () => { if (record.status !== "valid") await update("valid"); },
    mapError(error) {
      if (error.code === "UPSTREAM_AUTH_FAILED") { void update("invalid"); return new AmapApiError("Credential invalid", null, error.infocode, "CREDENTIAL_INVALID"); }
      if (["10003", "10044", "10045", "40000", "40002", "40003"].includes(error.infocode ?? "")) return new AmapApiError("Upstream quota exhausted", null, error.infocode, "UPSTREAM_QUOTA_EXHAUSTED");
      if (["10004", "10014", "10015", "10019", "10020", "10021", "10029"].includes(error.infocode ?? "")) return new AmapApiError("Upstream rate limited", null, error.infocode, "UPSTREAM_RATE_LIMITED");
      return error;
    } } };
}
