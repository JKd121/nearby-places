// A separate Node process and Prisma pool, sharing only the disposable PostgreSQL DB.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../dist/generated/prisma/client.js";
import { PostgresAdmissionStore, createAdmission } from "../dist/src/admission/service.js";
import { createAmapTransport } from "../dist/src/amap/transport.js";
const connectionString = process.argv[2];
const target = new URL(connectionString);
if (target.hostname !== "127.0.0.1" || !target.pathname.startsWith("/nearby_admission_test")) throw Error("Disposable loopback DB required");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 2, connectionTimeoutMillis: 200, statement_timeout: 800, lock_timeout: 150, idle_in_transaction_session_timeout: 800 }) });
const results = [];
const transport = createAmapTransport(async () => { results.push({ sentAt: Date.now() }); return Response.json({ status: "1" }); }, { beforeAttempt: createAdmission(new PostgresAdmissionStore(db), "test") });
try {
  // Establish distinct connections before the parent releases all workers.
  if (process.argv[4] === "barrier") {
    await db.$queryRawUnsafe("SELECT 1");
    process.stdout.write("READY\n");
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("Barrier timed out")), 10000);
      process.stdin.once("data", () => { clearTimeout(timer); resolve(); });
      process.stdin.once("end", () => { clearTimeout(timer); reject(Error("Barrier closed")); });
    });
  }
  const operation = process.argv[5] ?? "geocode";
  const endpoint = operation === "nearby" ? "/v5/place/around" : operation === "poi-text" ? "/v5/place/text" : "/v3/geocode/geo";
  for (let i = 0; i < Number(process.argv[3] ?? 1); i++) {
    try { await transport.requestJson(new URL(`https://restapi.amap.com${endpoint}?key=fake`), operation); }
    catch (e) { results.push({ code: e.code }); }
  }
  process.stdout.write(JSON.stringify(results));
} finally { await db.$disconnect(); }
