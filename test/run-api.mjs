import { mkdirSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Discover Route contract tests from source, never stale compiled output.
const files = readdirSync("test").filter(name => name.endsWith("-route.test.ts") || name === "api-contract.test.ts")
  .sort().map(name => `dist/test/${name.replace(/\.ts$/, ".js")}`);
if (!files.length) throw new Error("No API contract tests discovered");
mkdirSync("test-results/api", { recursive: true });
const result = spawnSync(process.execPath, [
  "--experimental-test-module-mocks", "--experimental-loader", "./test/history-route-loader.mjs",
  "--conditions=react-server", "--import", "./test/api-isolation.mjs", "--test",
  "--test-reporter=spec", "--test-reporter-destination=stdout",
  "--test-reporter=./test/api-reporter.mjs", "--test-reporter-destination=test-results/api/assertions.json",
  ...process.argv.slice(2), ...files, "test/api-isolation.test.mjs",
], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
