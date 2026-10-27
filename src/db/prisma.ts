import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";

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

// Separate pool: admission limits must not change existing history behavior.
let admissionPrisma: PrismaClient | undefined;
export function getAdmissionPrisma() {
  return admissionPrisma ??= new PrismaClient({ adapter: new PrismaPg({
    connectionString: databaseUrl, max: 4, connectionTimeoutMillis: 200,
    statement_timeout: 800, lock_timeout: 150, idle_in_transaction_session_timeout: 800,
    query_timeout: 1_200,
  }) });
}
