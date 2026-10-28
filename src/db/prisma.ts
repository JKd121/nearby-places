import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions/db-connections";
import { createDatabaseReadiness } from "./readiness.js";
import { admissionPoolPolicy } from "./admission-pool-policy.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured");
}

const adapter = new PrismaPg({
  connectionString: databaseUrl,
});

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

  if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { prisma };

// Retain one runtime per instance, including development module reloads.
// The ordinary history client above keeps its existing configuration.
const globalForAdmission = globalThis as unknown as { nearbyAdmissionDb?: ReturnType<typeof createAdmissionRuntime> };
function createAdmissionRuntime() {
  const pool = new Pool({ connectionString: databaseUrl, ...admissionPoolPolicy(process.env.VERCEL === "1") });
  if (process.env.VERCEL === "1") attachDatabasePool(pool);
  const client = new PrismaClient({ adapter: new PrismaPg(pool, { disposeExternalPool: true }) });
  const readiness = createDatabaseReadiness({
    async probe() { await client.$queryRawUnsafe("SELECT 1 AS ok"); },
    hasConnection: () => pool.totalCount > 0 && !pool.ending,
  });
  pool.on("error", () => readiness.invalidate());
  pool.on("remove", () => readiness.invalidate());
  return { client, readiness };
}
export function getAdmissionRuntime() {
  return globalForAdmission.nearbyAdmissionDb ??= createAdmissionRuntime();
}
export function getAdmissionPrisma() {
  return getAdmissionRuntime().client;
}
