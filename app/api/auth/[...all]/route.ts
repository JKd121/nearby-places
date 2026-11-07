import { withMailDelivery } from "../../../../src/identity/mail.js";
import { requireRate } from "../../../../src/identity/rate.js";
import { withRequestLifecycle, readRequestJson } from "../../../../src/server/request-lifecycle.js";
import { getAuth, withLoginTransaction } from "../../../../src/identity/auth.js";
import { endGuest, GUEST_SESSION_COOKIE, identityCookie } from "../../../../src/identity/service.js";
import { fingerprint, IdentityError, trustedOrigin } from "../../../../src/identity/security.js";
import { mapServerError } from "../../../../src/server/http.js";
import { assertAuthEndpoint } from "../../../../src/identity/access-mode.js";
import { authPath, assertAuthSource, authUnavailable, normalizeLoginResponse } from "../../../../src/identity/auth-policy.js";

export const runtime = "nodejs";
async function handle(request: Request) {
  let login = false;
  try {
    const url = authPath(request.url);
    assertAuthEndpoint(url.pathname);
    if (request.method === "POST") trustedOrigin(request);
    const canonical = new Request(url, request);
    login = request.method === "POST" && url.pathname === "/api/auth/sign-in/email";
    if (login) assertAuthSource(request.headers);
    const response = login ? await withLoginTransaction(async (auth, database) => {
      const result = await auth.handler(canonical);
      canonical.signal.throwIfAborted();
      if (result.status >= 500) throw new IdentityError("AUTH_SERVICE_UNAVAILABLE", 503, "登录服务暂不可用，请稍后重试");
      if (result.ok) await endGuest(request, database);
      canonical.signal.throwIfAborted();
      return result;
    }) : await withMailDelivery(() => getAuth().handler(canonical));
    if (login && response.ok) {
      response.headers.append("set-cookie", identityCookie(GUEST_SESSION_COOKIE, "", 0));
    }
    response.headers.set("cache-control", "private, no-store");
    return login ? normalizeLoginResponse(response) : response;
  } catch (error) {
    if (login && !(error instanceof IdentityError)) {
      console.error("auth.request.failed", { code: "AUTH_SERVICE_UNAVAILABLE" });
      return authUnavailable();
    }
    return mapServerError(error);
  }
}
export const GET = handle;
export async function POST(request: Request) {
  return withRequestLifecycle(request, async (context, policy) => {
    const url = authPath(request.url);
    assertAuthEndpoint(url.pathname);
    trustedOrigin(request);
    let body: unknown;
    try { body = await readRequestJson(request, context, policy.maxRequestBytes); }
    catch { context.check?.(); throw new IdentityError("INVALID_BODY", 400, "请求内容无效"); }
    const path = url.pathname;
    const purpose = path.endsWith("/request-password-reset") ? "reset" : path.endsWith("/sign-up/email") || path.endsWith("/send-verification-email") ? "verify" : null;
    if (purpose && body && typeof body === "object" && "email" in body && typeof body.email === "string" && body.email.length <= 254) {
      await requireRate(`mail:${purpose}:${fingerprint(body.email.trim().toLowerCase(), "email")}`, 60, 1);
    }
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    const forwarded = new Request(url, { method: "POST", headers, signal: context.signal, body: JSON.stringify(body) });
    return handle(forwarded);
  });
}
