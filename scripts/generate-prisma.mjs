import { spawnSync } from "node:child_process";

// Client generation reads Prisma config but does not connect to a database.
// Keep the fallback confined to this child; migrations/runtime still require real configuration.
const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "generate", "--config", "prisma7.config.ts"], {
  stdio: "inherit",
  env: { ...process.env, DIRECT_URL: process.env.DIRECT_URL || "postgresql://generate:generate@127.0.0.1:1/nearby_generate" },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
