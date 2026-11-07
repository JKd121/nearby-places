export class ApiError extends Error { constructor(message: string, readonly code?: string) { super(message); } }
export class LoginRateError extends ApiError { constructor(message: string, readonly retryAfter: number) { super(message); } }
export async function api(path: string, method = "GET", body?: unknown, sessionId?: string) {
  const response = await fetch(path, { method, credentials: "same-origin", cache: "no-store",
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(sessionId ? { "x-nearby-session": sessionId } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error?.message ?? ({ INVALID_EMAIL_OR_PASSWORD: "邮箱或密码有误", EMAIL_NOT_VERIFIED: "请先验证邮箱，可点击下方重新发送", USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "注册请求已处理，请检查邮箱或尝试登录", INVALID_TOKEN: "链接已过期或已使用，请重新申请" } as Record<string, string>)[data.code] ?? "操作未完成，请检查信息后重试";
    if (path === "/api/auth/sign-in/email" && response.status === 429) {
      const retry = Number(response.headers.get("retry-after") ?? response.headers.get("x-retry-after"));
      throw new LoginRateError(message, Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : 1);
    }
    throw new ApiError(message, data.error?.code ?? data.code);
  }
  return data;
}
