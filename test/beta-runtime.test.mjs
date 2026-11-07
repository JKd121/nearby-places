import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { assertLocalConfig, readConfig } from "../scripts/beta-runtime.mjs";

const local = { NEARBY_ACCESS_MODE: "local-beta", DATABASE_URL: "postgresql://user:password@127.0.0.1:55440/nearby_beta_local", DIRECT_URL: "postgresql://user:password@127.0.0.1:55440/nearby_beta_local", BETTER_AUTH_URL: "http://localhost:3130" };
test("local lifecycle guards reject remote databases, wrong ports and existing application databases", () => {
  assert.doesNotThrow(() => assertLocalConfig(local));
  for (const url of ["postgresql://user@db.example:55440/nearby_beta_local", "postgresql://user@127.0.0.1:5432/nearby_beta_local", "postgresql://user@127.0.0.1:55440/nearby_dev", "postgresql://user@127.0.0.1:55440/nearby_beta_local_other"]) {
    for (const name of ["DATABASE_URL", "DIRECT_URL"]) assert.throws(() => assertLocalConfig({ ...local, [name]: url }));
  }
  assert.throws(() => assertLocalConfig({ ...local, NEARBY_ACCESS_MODE: "private-beta" }));
});
test("management configuration must explicitly identify a beta environment", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nearby-beta-config-")), file = join(dir, "environment.json");
  await writeFile(file, JSON.stringify(local)); assert.deepEqual(await readConfig(file), local);
  await writeFile(file, JSON.stringify({ ...local, NEARBY_ACCESS_MODE: "verified" })); await assert.rejects(readConfig(file));
  await writeFile(file, JSON.stringify({ NEARBY_ACCESS_MODE: "private-beta" })); await assert.rejects(readConfig(file));
});
test("password-producing management commands refuse noninteractive execution before database access", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--conditions=react-server", "scripts/beta-account.ts", "create", "--email", "fixture@example.test"], { env: { ...process.env, NEARBY_BETA_MANAGEMENT: "1", DATABASE_URL: "invalid" }, encoding: "utf8", windowsHide: true });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /交互终端/); assert.doesNotMatch(result.stdout, /初始密码/);
});
