import "server-only";
import { prisma } from "../db/prisma.js";
import { IdentityError } from "./security.js";

export async function consumeCounter(key: string, window: number, max: number) {
  const rows = await prisma.$queryRaw<Array<{ count: number; retry: number }>>`
    INSERT INTO "RequestCounter" (key,count,"resetsAt") VALUES (${key},1,clock_timestamp()+${window}*interval '1 second')
    ON CONFLICT (key) DO UPDATE SET
      count=CASE WHEN "RequestCounter"."resetsAt" <= clock_timestamp() THEN 1 ELSE "RequestCounter".count+1 END,
      "resetsAt"=CASE WHEN "RequestCounter"."resetsAt" <= clock_timestamp() THEN clock_timestamp()+${window}*interval '1 second' ELSE "RequestCounter"."resetsAt" END
    RETURNING count, greatest(1,ceil(extract(epoch FROM ("resetsAt"-clock_timestamp()))))::int AS retry`;
  const row = rows[0]!;
  return { allowed: row.count <= max, retryAfter: row.count <= max ? null : row.retry };
}
export async function requireRate(key: string, window: number, max: number) {
  if (!(await consumeCounter(key, window, max)).allowed) throw new IdentityError("RATE_LIMITED", 429, "请求过于频繁，请稍后再试");
}
