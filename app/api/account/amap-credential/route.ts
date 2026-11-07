import { prisma } from "../../../../src/db/prisma.js";
import { requireAccount } from "../../../../src/identity/service.js";
import { credentialStatus, saveCredential } from "../../../../src/identity/credentials.js";
import { IdentityError, trustedOrigin } from "../../../../src/identity/security.js";
import { mapServerError } from "../../../../src/server/http.js";
import { withRequestLifecycle, readRequestJson } from "../../../../src/server/request-lifecycle.js";

export const runtime = "nodejs";
const json = (value: unknown) => Response.json(value, { headers: { "cache-control": "private, no-store" } });
export async function GET(request: Request) {
  try { return json(await credentialStatus((await requireAccount(request)).userId)); }
  catch (error) { return mapServerError(error); }
}
export async function PUT(request: Request) {
  return withRequestLifecycle(request, async (context, policy) => {
    trustedOrigin(request);
    const identity = await requireAccount(request, true);
    let body: unknown;
    try { body = await readRequestJson(request, context, policy.maxRequestBytes); }
    catch { context.check?.(); throw new IdentityError("INVALID_BODY", 400, "请求内容无效"); }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => key !== "key")) throw new IdentityError("INVALID_BODY", 400, "请求内容无效");
    return json(await saveCredential(identity.userId, (body as { key?: unknown }).key));
  });
}
export async function DELETE(request: Request) {
  try { trustedOrigin(request); const identity = await requireAccount(request, true);
    await prisma.userApiCredential.deleteMany({ where: { userId: identity.userId } });
    return json({ configured: false, status: "missing" });
  } catch (error) { return mapServerError(error); }
}
