import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { getAuth } from "./auth.js";
import { cookieValue, IdentityError, signGuest, trustedIp, verifyGuest } from "./security.js";
import { requireRate } from "./rate.js";
import { accessMode, assertGuestEnabled } from "./access-mode.js";

export const GUEST_ID_COOKIE = "nearby_guest_identity";
export const GUEST_SESSION_COOKIE = "nearby_guest_session";
export type RequestIdentity =
  | { kind: "account"; userId: string; sessionId: string; email: string; fresh: boolean }
  | { kind: "guest"; guestId: string; sessionId: string };

export async function resolveRequestIdentity(request: Request, onSessionHeaders?: (headers: Headers) => void): Promise<RequestIdentity> {
  const mode = accessMode();
  const result = await getAuth().api.getSession({ headers: request.headers, returnHeaders: true, query: { disableRefresh: !onSessionHeaders } });
  const session = result.response;
  onSessionHeaders?.(result.headers);
  if (session) {
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { disabledAt: true, betaAccess: true } });
    if (!user || user.disabledAt || (mode !== "verified" && !user.betaAccess)) throw new IdentityError("SESSION_EXPIRED", 401, "账号已停用或未获内测资格，请联系维护者");
    if (mode === "verified" && !session.user.emailVerified) throw new IdentityError("EMAIL_NOT_VERIFIED", 403, "请先验证邮箱");
    assertSession(request, session.session.id);
    return { kind: "account", userId: session.user.id, sessionId: session.session.id, email: session.user.email,
      fresh: Date.now() - session.session.createdAt.getTime() < 15 * 60_000 };
  }
  if (request.headers.get("cookie")?.includes("better-auth.session_token=")) throw new IdentityError("SESSION_EXPIRED", 401, "登录已过期，请重新登录");
  assertGuestEnabled();
  const guestId = verifyGuest(cookieValue(request.headers, GUEST_ID_COOKIE));
  const token = cookieValue(request.headers, GUEST_SESSION_COOKIE);
  const guest = token && guestId ? await prisma.guestSession.findUnique({ where: { id: token }, include: { guest: true } }) : null;
  if (!guest || guest.guestId !== guestId || +guest.expiresAt <= Date.now() || +guest.guest.expiresAt <= Date.now()) {
    throw new IdentityError("IDENTITY_REQUIRED", 401, "请选择匿名体验或登录账户");
  }
  assertSession(request, guest.id);
  return { kind: "guest", guestId, sessionId: guest.id };
}
export async function requireAccount(request: Request, fresh = false) {
  const identity = await resolveRequestIdentity(request);
  if (identity.kind !== "account") throw new IdentityError("ACCOUNT_REQUIRED", 403, "请先登录账户");
  if (fresh && !identity.fresh) throw new IdentityError("REAUTH_REQUIRED", 403, "请重新登录后管理凭证");
  return identity;
}
export async function startGuest(request: Request) {
  assertGuestEnabled();
  if (await getAuth().api.getSession({ headers: request.headers, query: { disableRefresh: true } })) throw new IdentityError("ACCOUNT_ACTIVE", 409, "请先退出账户，再进入匿名体验");
  await requireRate("guest-create:" + trustedIp(request.headers), 10, 3);
  const expiresAt = new Date(Date.now() + 365 * 86400_000);
  const previous = verifyGuest(cookieValue(request.headers, GUEST_ID_COOKIE));
  const existing = previous ? await prisma.guestIdentity.findUnique({ where: { id: previous } }) : null;
  const id = existing && +existing.expiresAt > Date.now() ? existing.id : randomUUID();
  const identity = await prisma.guestIdentity.upsert({ where: { id }, create: { id, expiresAt }, update: {} });
  const session = await prisma.guestSession.create({ data: { id: randomUUID(), guestId: id, expiresAt: new Date(Date.now() + 30 * 86400_000) } });
  return { identity: signGuest(id, +identity.expiresAt), session: session.id };
}
export async function endGuest(request: Request, database: Pick<typeof prisma, "guestSession"> = prisma) {
  const token = cookieValue(request.headers, GUEST_SESSION_COOKIE);
  if (token) await database.guestSession.deleteMany({ where: { id: token } });
}
export function identityCookie(name: string, value: string, maxAge: number) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

function assertSession(request: Request, id: string) {
  const expected = request.headers.get("x-nearby-session");
  if (expected && expected !== id) throw new IdentityError("IDENTITY_CHANGED", 409, "身份已变化，请刷新后重试");
}
