import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export function sourceIdentity() {
  const git = (...args) => {
    const result = spawnSync("git", args, { encoding: "utf8" });
    if (result.status !== 0) throw new Error("Cannot identify source with git");
    return result.stdout;
  };
  const files = [...new Set(git("ls-files", "--cached", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean))].sort();
  const digest = createHash("sha256");
  for (const file of files) {
    digest.update(file); digest.update("\0");
    try { digest.update(readFileSync(file)); } catch (error) { if (error.code === "ENOENT") digest.update("<deleted>"); else throw error; }
    digest.update("\0");
  }
  return { baselineSha: git("rev-parse", "HEAD").trim(), dirty: !!git("status", "--porcelain").trim(), sourceSha256: digest.digest("hex") };
}

// Run npm through its JS entry point on Windows as well as Linux; no shell.
if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/test-evidence.mjs")) {
  const mode = process.argv[2];
  const steps = { api: ["test:api:run"], browser: ["test:browser:run"], history: ["test:history:run"],
    acceptance: ["build", "test:api", "test:browser"] }[mode];
  if (!steps) throw new Error("Unknown evidence suite");
  const forwarded = process.argv.slice(3);
  if (mode === "acceptance" && forwarded.length) throw new Error("Use test:api or test:browser to select individual cases");
  const before = sourceIdentity();
  const startedAt = new Date().toISOString();
  const results = [];
  let exitCode = 0;
  try {
    for (const step of steps) {
      const start = Date.now();
      const env = mode === "acceptance" ? { ...process.env,
        DATABASE_URL: "postgresql://test:test@127.0.0.1:1/nearby_browser_test",
        DIRECT_URL: "postgresql://test:test@127.0.0.1:1/nearby_browser_test",
        AMAP_WEB_SERVICE_KEY: "", AMAP_CREDENTIAL_ID: "", VERCEL: "0" } : process.env;
      const args = [process.env.npm_execpath, "run", step, ...(forwarded.length ? ["--", ...forwarded] : [])];
      const result = spawnSync(process.execPath, args, { stdio: "inherit", env });
      exitCode = result.error ? 1 : result.status ?? 1;
      results.push({ command: `npm run ${step}`, arguments: forwarded, exitCode, durationMs: Date.now() - start });
      if (exitCode) break;
    }
  } finally {
    const after = sourceIdentity();
    const sourceUnchanged = before.sourceSha256 === after.sourceSha256;
    if (!sourceUnchanged) exitCode = 1;
    const directory = `test-results/evidence/${mode}`;
    mkdirSync(directory, { recursive: true });
    const record = { schemaVersion: 1, ...before, sourceUnchanged, startedAt, finishedAt: new Date().toISOString(),
      command: `npm run test:${mode === "history" ? "history:integration" : mode}`,
      arguments: forwarded, exitCode, steps: results, evidence: ["test-results/", "playwright-report/"],
      ciRun: process.env.GITHUB_RUN_ID ?? null };
    writeFileSync(`${directory}/run.json`, JSON.stringify(record, null, 2));
    console.log(`Evidence: ${directory}/run.json`);
  }
  process.exitCode = exitCode;
}
