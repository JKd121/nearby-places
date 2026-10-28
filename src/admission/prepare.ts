import type { BeforeAmapAttempt } from "../amap/transport.js";
import { throwIfAborted } from "../amap/request-context.js";
import { AdmissionError } from "./errors.js";

export interface AdmissionPreparation {
  ensure(signal?: AbortSignal): Promise<void>;
  touch(): void;
  invalidate(): void;
}

/** The short admission clock starts only when the underlying admission hook runs. */
export function withAdmissionPreparation(admit: BeforeAmapAttempt, prepare: () => Promise<AdmissionPreparation>): BeforeAmapAttempt {
  return async (operation, signal, context) => {
    throwIfAborted(signal);
    let readiness: AdmissionPreparation;
    try { readiness = await prepare(); await readiness.ensure(signal); }
    catch { throwIfAborted(signal); throw new AdmissionError("ADMISSION_UNAVAILABLE"); }
    throwIfAborted(signal);
    try {
      const permit = await admit(operation, signal, context);
      readiness.touch();
      return permit;
    } catch (error) {
      if (error instanceof AdmissionError && error.code === "ADMISSION_UNAVAILABLE") readiness.invalidate();
      throw error;
    }
  };
}
