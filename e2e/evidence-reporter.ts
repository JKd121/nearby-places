import type { FullConfig, FullResult, Reporter } from "@playwright/test/reporter";
import { mkdirSync, writeFileSync } from "node:fs";
import { sourceIdentity } from "../scripts/test-evidence.mjs";

export default class EvidenceReporter implements Reporter {
  private before = sourceIdentity();
  private output = "";
  private startedAt = new Date().toISOString();
  onBegin(config: FullConfig) {
    this.output = config.projects[0]!.outputDir;
  }
  async onEnd(result: FullResult) {
    if (!this.output) return;
    mkdirSync(this.output, { recursive: true });
    const sourceUnchanged = sourceIdentity().sourceSha256 === this.before.sourceSha256;
    writeFileSync(`${this.output}/source.json`, JSON.stringify({ ...this.before, sourceUnchanged,
      startedAt: this.startedAt, finishedAt: new Date().toISOString(), status: result.status }, null, 2));
    if (!sourceUnchanged) return { status: "failed" as const };
  }
}
