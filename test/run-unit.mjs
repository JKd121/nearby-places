import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

// Derive the suite from source files: stale dist files cannot enter the run.
const names = await readdir("test");
const compiled = names.filter(name => name.endsWith(".test.ts") && name !== "admission-postgres.test.ts")
  .sort().map(name => `dist/test/${name.replace(/\.ts$/, ".js")}`);
const modules = names.filter(name => name.endsWith(".test.mjs")).sort().map(name => `test/${name}`);
for (const args of [
  ["--experimental-test-module-mocks", "--experimental-specifier-resolution=node", "--experimental-loader", "./test/history-route-loader.mjs", "--conditions=react-server", "--test", ...compiled],
  ["--test", ...modules],
]) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
