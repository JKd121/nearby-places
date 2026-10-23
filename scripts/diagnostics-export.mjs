// Offline only. No network, database or third-party dependencies.
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

export function extractDiagnostics(input, { requestId, sessionId } = {}) {
  const records = [];
  const events = new Set(["http.request.started", "http.request.completed", "phase.completed", "phase.failed", "diagnostics.error", "search.completed", "location.resolve.completed", "search.category.completed"]);
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  const fields = ["timestamp", "level", "event", "stage", "requestId", "diagnosticSessionId", "route", "environment", "commitSha", "deploymentId", "durationMs", "scheduledMs", "status", "category", "outcome", "error", "handled"];
  function walk(value) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try { walk(JSON.parse(trimmed)); } catch { /* Not a JSON log message. */ }
      }
    } else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") {
      if (events.has(value.event) && uuid.test(value.requestId) && typeof value.timestamp === "string") {
        if ((!requestId || value.requestId === requestId) && (!sessionId || value.diagnosticSessionId === sessionId)) {
          records.push(Object.fromEntries(fields.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]])));
        }
      } else Object.values(value).forEach(walk);
    }
  }
  try { walk(JSON.parse(input)); }
  catch {
    for (const line of input.split(/\r?\n/)) {
      try { walk(JSON.parse(line)); } catch { /* Ignore unrelated/malformed lines. */ }
    }
  }
  return records;
}

// Exported function is also exercised by the unit suite; CLI runs only when invoked directly.
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { request: { type: "string" }, session: { type: "string" }, output: { type: "string" } } });
  if (positionals.length !== 1 || !values.output) throw new Error("Usage: node scripts/diagnostics-export.mjs input.json --output sample.jsonl [--request UUID] [--session UUID]");
  const records = extractDiagnostics(readFileSync(positionals[0], "utf8").replace(/^\uFEFF/, ""), { requestId: values.request, sessionId: values.session });
  writeFileSync(values.output, records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : ""), { encoding: "utf8", flag: "wx" });
  console.error(`Extracted ${records.length} application events. Compare request starts/completions to check completeness.`);
  if (!records.length) process.exitCode = 1;
}
