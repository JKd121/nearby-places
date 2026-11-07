import { prisma } from "../../../../src/db/prisma.js";
import { resolveRequestIdentity } from "../../../../src/identity/service.js";
import { IdentityError } from "../../../../src/identity/security.js";
import { budgetPeriod } from "../../../../src/admission/service.js";
import { guestDailyLimit } from "../../../../src/server/identity-admission.js";
import { mapServerError } from "../../../../src/server/http.js";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const identity = await resolveRequestIdentity(request);
    if (identity.kind !== "guest") throw new IdentityError("GUEST_REQUIRED", 403, "当前为账户身份");
    const period = budgetPeriod(new Date());
    const row = await prisma.guestDailyUsage.findUnique({ where: { guestId_day: { guestId: identity.guestId, day: period.day } } });
    const limit = guestDailyLimit();
    return Response.json({ limit, remaining: Math.max(0, limit - (row?.used ?? 0)), resetsAt: period.nextDay }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return mapServerError(error); }
}
