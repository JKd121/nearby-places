/** Next calls register once per server instance; keep imports Node-only and lazy. */
export async function register() {
  // Keep a direct runtime branch so Next can prune Node-only imports from Edge.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NEXT_PHASE === "phase-production-build" || !process.env.DATABASE_URL) return;
    try {
      const { prepareServerAdmission } = await import("./src/server/admission.js");
      await prepareServerAdmission();
    } catch {
      // Startup failure leaves readiness cold; a later request may prepare after cooldown.
      console.error("database.prepare.failed", { phase: "startup", code: "ADMISSION_UNAVAILABLE" });
    }
  }
}
