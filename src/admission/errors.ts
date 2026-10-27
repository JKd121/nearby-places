import { AmapApiError } from "../amap/errors.js";

export type AdmissionCode = "DAILY_BUDGET_EXHAUSTED" | "MONTHLY_BUDGET_EXHAUSTED" | "ADMISSION_WAIT_EXCEEDED" | "ADMISSION_UNAVAILABLE";
export class AdmissionError extends AmapApiError {
  constructor(code: AdmissionCode, readonly retryAt?: string) {
    super("Upstream admission refused", null, null, code);
    this.name = "AdmissionError";
  }
}
