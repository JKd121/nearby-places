import { spawn } from "node:child_process";
import { historyDatabaseUrl } from "./database-target.mjs";

const mode = process.argv[2];
if (!["browser", "history"].includes(mode)) throw new Error("Expected browser or history test mode");
const database = mode === "history" ? historyDatabaseUrl().href : "postgresql://test:test@127.0.0.1:1/nearby_browser_test";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", mode === "history" ? "3120" : "3119"], {
  stdio: "inherit",
  env: {
    ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
    DATABASE_URL: database, DIRECT_URL: database,
    AMAP_WEB_SERVICE_KEY: "", AMAP_CREDENTIAL_ID: "", VERCEL: "0",
  },
});
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
