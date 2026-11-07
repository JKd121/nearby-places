import { startGuest, endGuest, GUEST_ID_COOKIE, GUEST_SESSION_COOKIE, identityCookie } from "../../../../src/identity/service.js";
import { trustedOrigin } from "../../../../src/identity/security.js";
import { mapServerError } from "../../../../src/server/http.js";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    trustedOrigin(request);
    const guest = await startGuest(request);
    const response = Response.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
    response.headers.append("set-cookie", identityCookie(GUEST_ID_COOKIE, guest.identity, 365 * 86400));
    response.headers.append("set-cookie", identityCookie(GUEST_SESSION_COOKIE, guest.session, 30 * 86400));
    response.headers.append("set-cookie", identityCookie("better-auth.session_token", "", 0));
    response.headers.append("set-cookie", identityCookie("__Secure-better-auth.session_token", "", 0));
    return response;
  } catch (error) { return mapServerError(error); }
}
export async function DELETE(request: Request) {
  try { trustedOrigin(request); await endGuest(request);
    return Response.json({ ok: true }, { headers: { "cache-control": "private, no-store", "set-cookie": identityCookie(GUEST_SESSION_COOKIE, "", 0) } });
  } catch (error) { return mapServerError(error); }
}
