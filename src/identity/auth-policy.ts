import { isValidIP } from "@better-auth/core/utils/ip";
import { IdentityError } from "./security.js";

export const INVALID_LOGIN = { code: "INVALID_EMAIL_OR_PASSWORD", message: "邮箱或密码有误" };
export function authPath(url: string) {
  const parsed = new URL(url), path = parsed.pathname;
  if (!path.startsWith("/api/auth/") || /%|\\|\/\//.test(path) || path.endsWith("//")) {
    throw new IdentityError("INVALID_AUTH_PATH", 400, "认证路径无效");
  }
  parsed.pathname = path.replace(/\/$/, "");
  return parsed;
}
export function assertAuthSource(headers: Headers) {
  if (process.env.VERCEL !== "1") return; // Local/direct runtimes deliberately share a source bucket.
  const ip = headers.get("x-vercel-forwarded-for");
  if (!ip || ip !== ip.trim() || !isValidIP(ip)) throw new IdentityError("AUTH_SOURCE_UNAVAILABLE", 503, "登录来源暂不可用，请稍后重试");
}
export function authUnavailable() {
  return Response.json({ error: { code: "AUTH_SERVICE_UNAVAILABLE", message: "登录服务暂不可用，请稍后重试" } }, { status: 503, headers: { "cache-control": "private, no-store" } });
}
export async function normalizeLoginResponse(response: Response) {
  if (response.status >= 500) return authUnavailable();
  if (response.status === 401) return Response.json(INVALID_LOGIN, { status: 401, headers: { "cache-control": "private, no-store" } });
  if (response.status === 429) {
    const seconds = Number(response.headers.get("retry-after") ?? response.headers.get("x-retry-after"));
    const retry = Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 1;
    return Response.json({ error: { code: "RATE_LIMITED", message: "登录尝试过于频繁，请稍后重试" } }, { status: 429,
      headers: { "retry-after": String(retry), "x-retry-after": String(retry), "cache-control": "private, no-store" } });
  }
  return response;
}
