import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export class IdentityError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) { super(message); }
}
export function secret(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 32) throw new IdentityError("IDENTITY_UNAVAILABLE", 503, "身份服务配置暂不可用");
  return value;
}
export function fingerprint(value: string, purpose = "credential"): string {
  return createHmac("sha256", secret("NEARBY_FINGERPRINT_SECRET")).update(purpose + "\0" + value).digest("hex");
}
export function signGuest(id: string, expires: number): string {
  const payload = `${id}.${expires}`;
  return payload + "." + createHmac("sha256", secret("NEARBY_GUEST_SECRET")).update(payload).digest("base64url");
}
export function verifyGuest(value: string | undefined, now = Date.now()): string | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3 || !/^[0-9a-f-]{36}$/.test(parts[0]!) || !/^\d{13}$/.test(parts[1]!)) return null;
  if (Number(parts[1]) <= now) return null;
  const expected = signGuest(parts[0]!, Number(parts[1])).split(".")[2]!;
  const a = Buffer.from(expected), b = Buffer.from(parts[2]!);
  return a.length === b.length && timingSafeEqual(a, b) ? parts[0]! : null;
}
function encryptionKey(version: number): Buffer {
  let keys: unknown;
  try { keys = JSON.parse(process.env.NEARBY_CREDENTIAL_KEYS ?? "{}"); } catch { /* Fixed error below. */ }
  const key = keys && typeof keys === "object" ? (keys as Record<string, unknown>)[String(version)] : undefined;
  if (typeof key !== "string" || !/^[a-f0-9]{64}$/i.test(key)) throw new IdentityError("CREDENTIAL_UNAVAILABLE", 503, "凭证加密配置暂不可用");
  return Buffer.from(key, "hex");
}
export function encryptCredential(key: string, userId: string) {
  const version = Number(process.env.NEARBY_CREDENTIAL_KEY_VERSION ?? "1");
  if (!Number.isSafeInteger(version) || version < 1) throw new IdentityError("CREDENTIAL_UNAVAILABLE", 503, "凭证加密配置暂不可用");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(version), nonce);
  cipher.setAAD(Buffer.from(`${userId}:${version}`));
  const encrypted = Buffer.concat([cipher.update(key, "utf8"), cipher.final()]);
  return { encryptedKey: Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString("base64"), encryptionVersion: version };
}
export function decryptCredential(record: { encryptedKey: string; encryptionVersion: number; userId: string }): string {
  const key = encryptionKey(record.encryptionVersion);
  try {
    const bytes = Buffer.from(record.encryptedKey, "base64");
    if (bytes.length < 29) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    decipher.setAAD(Buffer.from(`${record.userId}:${record.encryptionVersion}`));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
  } catch { throw new IdentityError("CREDENTIAL_DECRYPT_FAILED", 503, "高德凭证读取失败，请重新保存 Key"); }
}
export function trustedOrigin(request: Request) {
  const base = process.env.BETTER_AUTH_URL;
  const origin = request.headers.get("origin");
  if (!base || !origin || origin !== new URL(base).origin) throw new IdentityError("INVALID_ORIGIN", 403, "请求来源校验失败");
}
export function cookieValue(headers: Headers, name: string) {
  return headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(name + "="))?.slice(name.length + 1);
}
export function trustedIp(headers: Headers): string {
  // Vercel overwrites x-vercel-forwarded-for. Local requests share a loopback bucket.
  const value = process.env.VERCEL === "1" ? headers.get("x-vercel-forwarded-for") : "loopback";
  if (!value || value.includes(",") || value.length > 100) throw new IdentityError("IDENTITY_UNAVAILABLE", 503, "请求地址校验失败");
  return fingerprint(value, "ip");
}
