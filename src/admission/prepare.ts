import type { BeforeAmapAttempt } from "../amap/transport.js";
import { throwIfAborted } from "../amap/request-context.js";
import { AdmissionError, transientAdmission, logAdmissionFailure } from "./errors.js";

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
    try { readiness = await prepare(); }
    catch {
      throwIfAborted(signal);
      const error = new AdmissionError("ADMISSION_UNAVAILABLE");
      logAdmissionFailure(error, { phase: "prepare", operation, attemptId: crypto.randomUUID(), admissionCode: error.code,
        recovery: error.recovery, connectionState: error.connection });
      throw error;
    }
    try { await readiness.ensure(signal); }
    catch (caught) {
      throwIfAborted(signal);
      const error = caught instanceof AdmissionError ?
        new AdmissionError(caught.code as ConstructorParameters<typeof AdmissionError>[0], caught.retryAt, caught.recovery, caught.connection) : transientAdmission();
      logAdmissionFailure(error, { phase: "prepare", operation, attemptId: crypto.randomUUID(), admissionCode: error.code,
        recovery: error.recovery, connectionState: error.connection });
      throw error;
    }
    throwIfAborted(signal);
    try {
      const permit = await admit(operation, signal, context);
      readiness.touch();
      return permit;
    } catch (error) {
      // Removed clients already notify the pool. Preserve readiness when a healthy
      // client remains, and re-probe only failures without a confirmed disposition.
      if (error instanceof AdmissionError && error.code === "ADMISSION_UNAVAILABLE" && error.connection === "unknown") readiness.invalidate();
      throw error;
    }
  };
}
