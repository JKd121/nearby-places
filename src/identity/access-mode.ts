import { IdentityError } from "./security.js";

export type AccessMode = "verified" | "local-beta" | "private-beta";
export function accessMode(): AccessMode {
  const mode = process.env.NEARBY_ACCESS_MODE ?? "verified";
  if (!["verified", "local-beta", "private-beta"].includes(mode) || (mode === "local-beta" && process.env.NODE_ENV === "production")) {
    throw new IdentityError("ACCESS_MODE_INVALID", 503, "访问模式配置有误，请联系维护者");
  }
  return mode as AccessMode;
}
export function assertAuthEndpoint(path: string) {
  if (accessMode() === "verified") return;
  const endpoint = path.replace(/\/$/, "").split("/api/auth/")[1];
  if (!["sign-in/email", "sign-out", "get-session", "ok"].includes(endpoint ?? "")) {
    throw new IdentityError("AUTH_FEATURE_DISABLED", 403, "内测账号由维护者创建，暂未开放注册和邮件功能");
  }
}
export function assertGuestEnabled() {
  if (accessMode() === "private-beta") throw new IdentityError("IDENTITY_REQUIRED", 401, "请使用内测账号登录");
}
