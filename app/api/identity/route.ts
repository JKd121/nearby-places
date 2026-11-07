import { resolveRequestIdentity } from "../../../src/identity/service.js";
import { credentialStatus } from "../../../src/identity/credentials.js";
import { IdentityError } from "../../../src/identity/security.js";
import { mapServerError } from "../../../src/server/http.js";
import { accessMode } from "../../../src/identity/access-mode.js";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const headers = new Headers({ "cache-control": "private, no-store" });
    const identity = await resolveRequestIdentity(request, sessionHeaders => {
      for (const cookie of sessionHeaders.getSetCookie()) headers.append("set-cookie", cookie);
    });
    return Response.json(identity.kind === "guest" ? { kind: "guest", id: identity.sessionId, accessMode: accessMode() } : {
      kind: "account", id: identity.userId, sessionId: identity.sessionId, email: identity.email, credentialRequiresReauth: !identity.fresh, credential: await credentialStatus(identity.userId), accessMode: accessMode(),
    }, { headers });
  } catch (error) {
    if (error instanceof IdentityError && ["IDENTITY_REQUIRED", "SESSION_EXPIRED"].includes(error.code)) return Response.json({ kind: "none", accessMode: accessMode() }, { headers: { "cache-control": "private, no-store" } });
    return mapServerError(error);
  }
}
