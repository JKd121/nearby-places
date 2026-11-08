import { spawn } from "node:child_process";
// This browser suite intercepts business/SDK requests; it never opens a database or calls AMap.
const production = process.env.NEARBY_MAP_TEST_PRODUCTION === "1";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", production ? "start" : "dev", ...(production ? [] : ["--webpack"]), "--port", "3136", "--hostname", "localhost"], {
  env: { ...process.env, DATABASE_URL: "", DIRECT_URL: "", NEARBY_ACCESS_MODE: "verified", NEXT_TELEMETRY_DISABLED: "1" },
  stdio: "inherit", windowsHide: true,
});
process.on("SIGINT", () => child.kill()); process.on("SIGTERM", () => child.kill());
child.on("exit", code => { process.exitCode = code ?? 0; });
