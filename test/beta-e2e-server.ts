import { writeFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { configureIdentityTest, resetIdentityDatabase } from "./identity-test-runtime.js";

const mode = process.env.NEARBY_BETA_E2E_ACCESS_MODE ?? "private-beta";
if (!["local-beta", "private-beta"].includes(mode)) throw new Error("Unsupported beta E2E access mode");
process.env.NEARBY_IDENTITY_TEST_ACCESS_MODE = mode;
const url = configureIdentityTest();
delete process.env.SMTP_HOST; delete process.env.SMTP_FROM;
await resetIdentityDatabase(url);
const { createTestAccount } = await import("../src/identity/test-accounts.js");
const { prisma } = await import("../src/db/prisma.js");
const a = await createTestAccount("browser-beta-a@example.test"), b = await createTestAccount("browser-beta-b@example.test");
await mkdir(".local/nearby-beta-e2e", { recursive: true });
await writeFile(".local/nearby-beta-e2e/accounts.json", JSON.stringify({ a, b }), { mode: 0o600 });
await prisma.$disconnect();
const child = spawn(process.execPath, ["--import", pathToFileURL(resolve("test/e2e-amap-preload.mjs")).href,
  "node_modules/next/dist/bin/next", "dev", "--webpack", "--port", "3127", "--hostname", "localhost"], {
  env: { ...process.env, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1" }, stdio: "inherit", windowsHide: true,
});
process.on("SIGINT", () => child.kill()); process.on("SIGTERM", () => child.kill());
child.on("exit", code => { process.exitCode = code ?? 0; });
