import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { createProvisioningAuth } from "./auth.js";
import { accessMode } from "./access-mode.js";
import { IdentityError } from "./security.js";

function assertBeta() {
  if (accessMode() === "verified") throw new IdentityError("BETA_ONLY", 400, "账号管理命令仅用于明确指定的内测环境");
}
export async function createTestAccount(email: string) {
  assertBeta();
  const normalized = email.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email: normalized } })) throw new IdentityError("ACCOUNT_CONFLICT", 409, "账号已存在，保留现有密码和 Key；请使用重置命令或其他邮箱");
  const password = randomBytes(24).toString("base64url");
  const result = await createProvisioningAuth().api.signUpEmail({ body: { email: normalized, name: normalized.split("@")[0] || "内测用户", password } });
  await prisma.user.update({ where: { id: result.user.id }, data: { betaAccess: true } });
  return { userId: result.user.id, email: normalized, password };
}
export async function manageTestAccount(email: string, operation: "reset-password" | "disable") {
  assertBeta();
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) throw new IdentityError("ACCOUNT_MISSING", 404, "账号不存在");
  const password = operation === "reset-password" ? randomBytes(24).toString("base64url") : undefined;
  const hash = password ? await (await createProvisioningAuth().$context).password.hash(password) : undefined;
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(674827103)`;
    // Same user lock as final admission, then revoke sessions in this transaction.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
    if (operation === "disable") await tx.user.update({ where: { id: user.id }, data: { disabledAt: new Date() } });
    else {
      const changed = await tx.account.updateMany({ where: { userId: user.id, providerId: "credential" }, data: { password: hash! } });
      if (changed.count !== 1) throw new IdentityError("ACCOUNT_INVALID", 409, "密码账号状态异常，操作已取消");
    }
    await tx.session.deleteMany({ where: { userId: user.id } });
  });
  return { userId: user.id, ...(password ? { password } : {}) };
}
