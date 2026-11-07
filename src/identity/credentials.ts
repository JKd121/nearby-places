import "server-only";
import { prisma } from "../db/prisma.js";
import { encryptCredential, decryptCredential, fingerprint, IdentityError } from "./security.js";

export async function credentialStatus(userId: string) {
  const record = await prisma.userApiCredential.findUnique({ where: { userId }, select: { status: true, lastFour: true, validatedAt: true } });
  return record ? { configured: true, ...record } : { configured: false, status: "missing" };
}
export async function saveCredential(userId: string, key: unknown) {
  if (typeof key !== "string" || !/^[a-f0-9]{32}$/i.test(key.trim())) throw new IdentityError("INVALID_CREDENTIAL", 400, "请输入 32 位高德 Web Service Key");
  const normalized = key.trim();
  const data = { ...encryptCredential(normalized, userId), fingerprint: fingerprint(normalized), lastFour: normalized.slice(-4), status: "pending", validatedAt: null };
  await prisma.userApiCredential.upsert({ where: { userId }, create: { userId, ...data }, update: { ...data, version: { increment: 1 } } });
  return credentialStatus(userId);
}
export async function loadCredential(userId: string) {
  const record = await prisma.userApiCredential.findUnique({ where: { userId } });
  if (!record) throw new IdentityError("CREDENTIAL_REQUIRED", 409, "请先在个人中心配置高德 Web Service Key");
  if (record.status === "invalid") throw new IdentityError("CREDENTIAL_INVALID", 409, "高德 Key 已失效，请在个人中心更新");
  return { record, key: decryptCredential(record) };
}
