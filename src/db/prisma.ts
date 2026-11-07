import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions/db-connections";
import { createDatabaseReadiness } from "./readiness.js";
import { admissionPoolPolicy } from "./admission-pool-policy.js";
import { PipelinedAdmissionDatabase } from "../admission/database.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured");
}

const adapter = new PrismaPg({
  connectionString: databaseUrl,
  options: "-c timezone=UTC",
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
const globalForAdmission = globalThis as unknown as { nearbyAdmissionDbV2?: ReturnType<typeof createAdmissionRuntime> };
function createAdmissionRuntime() {
  const pool = new Pool({ connectionString: databaseUrl, ...admissionPoolPolicy(process.env.VERCEL === "1") });
  if (process.env.VERCEL === "1") attachDatabasePool(pool);
  const database = new PipelinedAdmissionDatabase(pool);
  const readiness = createDatabaseReadiness({
    async probe() { await pool.query("SELECT 1 AS ok"); },
    hasConnection: () => pool.totalCount > 0 && !pool.ending,
  });
  pool.on("error", () => readiness.invalidate());
  pool.on("remove", () => { if (pool.totalCount === 0) readiness.invalidate(); });
  return { pool, database, readiness, close: () => pool.end() };
}
export function getAdmissionRuntime() {
  return globalForAdmission.nearbyAdmissionDbV2 ??= createAdmissionRuntime();
}
