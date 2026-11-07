import { mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync } from "node:fs";
import { join } from "node:path";
import { markdown, publicReport, type Report } from "./report.js";
import { MAX_CALLS } from "./model.js";

/** Exclusive, fixed-path, one-shot V1 budget reservation; no CLI reset/resume/alternate ledger. */
export function claimLiveBudget(directory: string) {
  mkdirSync(directory, { recursive: true });
  const fd = openSync(join(directory, "live-budget.lock"), "wx", 0o600);
  let calls = 0;
  const save = () => { writeFileSync(fd, `${JSON.stringify({ version: "poi-union-v1", reserved: MAX_CALLS, calls })}\n`); fsyncSync(fd); };
  try { save(); } finally { closeSync(fd); }
  return { beforeHttp() {
    if (calls >= MAX_CALLS) throw new Error("Global V1 budget exhausted");
    // Append-only durable attempt journal. Never clear the reservation after failure/interruption.
    const journal = openSync(join(directory, "live-attempts.jsonl"), "a", 0o600);
    try { writeFileSync(journal, `${JSON.stringify({ attempt: ++calls })}\n`); fsyncSync(journal); }
    finally { closeSync(journal); }
  } };
}

export function reportWriter(directory: string) {
  mkdirSync(directory, { recursive: true });
  return (report: Report) => {
    for (const [name, contents] of [["report.json", `${JSON.stringify(publicReport(report), null, 2)}\n`], ["report.md", markdown(report)]]) {
      const path = join(directory, name!);
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, contents!, { mode: 0o600 });
      renameSync(tmp, path);
    }
  };
}
