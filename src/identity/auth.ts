import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "../db/prisma.js";
import { secret, fingerprint } from "./security.js";
import { consumeCounter } from "./rate.js";
import { sendIdentityMail } from "./mail.js";
import { accessMode } from "./access-mode.js";
import type { Prisma } from "../../generated/prisma/client.js";

type AuthDatabase = typeof prisma | Prisma.TransactionClient;
type PasswordCodec = { hash: (password: string) => Promise<string>; verify: (value: { hash: string; password: string }) => Promise<boolean> };
function createAuth(provisioning = false, database: AuthDatabase = prisma, password?: PasswordCodec) {
  const verified = !provisioning && accessMode() === "verified";
  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    secret: secret("BETTER_AUTH_SECRET"),
    database: prismaAdapter(database, { provider: "postgresql" }),
    emailAndPassword: { enabled: true, requireEmailVerification: verified, disableSignUp: !provisioning && !verified, autoSignIn: !provisioning, minPasswordLength: 8, maxPasswordLength: 128,
      ...(password ? { password } : {}),
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => { await sendIdentityMail(user.email, url, "reset"); } },
    emailVerification: { sendOnSignUp: verified, autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) => { await sendIdentityMail(user.email, url, "verify"); } },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, window: 10, max: 100,
      customStorage: { consume: async (key, rule) => consumeCounter("auth:" + fingerprint(key, "auth-rate"), rule.window, rule.max) } },
    advanced: { ipAddress: { ipAddressHeaders: process.env.VERCEL === "1" ? ["x-vercel-forwarded-for"] : [] } },
    databaseHooks: { session: { create: { before: async session => {
      const user = await database.user.findUnique({ where: { id: session.userId }, select: { disabledAt: true, betaAccess: true } });
      if (!user || user.disabledAt || (!verified && !user.betaAccess)) return false;
      return { data: { ...session, ipAddress: session.ipAddress ? fingerprint(session.ipAddress, "ip") : null } };
    } } } },
    logger: { disabled: true },
  });
}

let instance: ReturnType<typeof createAuth> | undefined;
let instanceMode: string | undefined;
export function getAuth() {
  const mode = accessMode();
  if (!instance || instanceMode !== mode) { instance = createAuth(); instanceMode = mode; }
  return instance;
}
// Only local management tools use this instance; it is never mounted as a Route handler.
export function createProvisioningAuth() { return createAuth(true); }
/** Only durable login state participates; the existing request counter remains independent. */
export async function withLoginTransaction<T>(action: (auth: ReturnType<typeof createAuth>, database: AuthDatabase) => Promise<T>) {
  const context = await getAuth().$context;
  return prisma.$transaction(database => action(createAuth(false, database, context.password), database), { maxWait: 3000, timeout: 5000 });
}
