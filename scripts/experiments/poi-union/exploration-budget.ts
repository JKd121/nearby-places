import { existsSync, readFileSync, openSync, writeFileSync, fsyncSync, closeSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { MAX_CALLS } from "./model.js";
import { claimLiveBudget } from "./storage.js";

/** One-time handover of an unused V1 reservation, never a new nine-call allowance. */
export function claimExplorationBudget(directory: string) {
  mkdirSync(directory, { recursive: true });
  const reservation = join(directory, "live-budget.lock");
  const journalPath = join(directory, "live-attempts.jsonl");
  if (existsSync(journalPath)) throw new Error("V1 already has an HTTP attempt journal");
  if (existsSync(reservation)) {
    const value = JSON.parse(readFileSync(reservation, "utf8"));
    if (value.version !== "poi-union-v1" || value.reserved !== MAX_CALLS || value.calls !== 0) throw new Error("Unsupported V1 reservation");
  } else {
    claimLiveBudget(directory);
  }
  // Original CLI remains locked out by live-budget.lock. This exclusive marker locks out repeat exploration runs.
  const marker = openSync(join(directory, "local-exploration.lock"), "wx", 0o600);
  try {
    writeFileSync(marker, JSON.stringify({ version: "poi-union-v1", control: "local-exploration", reserved: MAX_CALLS, priorHttpCalls: 0 }) + "\n");
    fsyncSync(marker);
  } finally { closeSync(marker); }
  let calls = 0;
  return { beforeHttp() {
    if (calls >= MAX_CALLS) throw new Error("V1 budget exhausted");
    const journal = openSync(journalPath, "a", 0o600);
    try { writeFileSync(journal, JSON.stringify({ attempt: ++calls, control: "local-exploration" }) + "\n"); fsyncSync(journal); }
    finally { closeSync(journal); }
  } };
}
