import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractDiagnostics } from "../scripts/diagnostics-export.mjs";

test("offline exporter handles JSON arrays, nested request logs, JSONL and exact session/request filters", () => {
  const sessionId = randomUUID();
  const one = { timestamp: new Date().toISOString(), event: "http.request.started", requestId: randomUUID(), diagnosticSessionId: sessionId };
  const two = { ...one, requestId: randomUUID(), diagnosticSessionId: randomUUID() };
  assert.deepEqual(extractDiagnostics(JSON.stringify([{ logs: [{ message: JSON.stringify(one) }] }, { logs: [two] }])), [one, two]);
  assert.deepEqual(extractDiagnostics([JSON.stringify(one), "not JSON", JSON.stringify(two)].join("\n"), { sessionId }), [one]);
  assert.deepEqual(extractDiagnostics(JSON.stringify([one, two]), { requestId: two.requestId }), [two]);
  assert.deepEqual(extractDiagnostics('{"logs":[]}'), []);
});

test("CLI writes UTF8 JSONL offline and refuses to overwrite an existing export", () => {
  const directory = mkdtempSync(join(tmpdir(), "nearby-diagnostics-"));
  try {
    const input = join(directory, "input.json");
    const output = join(directory, "sample.jsonl");
    const record = { timestamp: new Date().toISOString(), event: "http.request.completed", requestId: randomUUID(), status: 200 };
    writeFileSync(input, JSON.stringify([{ message: JSON.stringify(record) }]));
    const args = ["scripts/diagnostics-export.mjs", input, "--output", output];
    assert.equal(spawnSync(process.execPath, args).status, 0);
    assert.deepEqual(JSON.parse(readFileSync(output, "utf8")), record);
    assert.notEqual(spawnSync(process.execPath, args).status, 0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
