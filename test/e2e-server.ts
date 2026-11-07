import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { SMTPServer } from "smtp-server";
import { configureIdentityTest, resetIdentityDatabase } from "./identity-test-runtime.js";

const url = configureIdentityTest();
await resetIdentityDatabase(url);
const messages: string[] = [];
const smtp = new SMTPServer({ authOptional: true, disabledCommands: ["STARTTLS"], onData(stream, _session, callback) {
  let text = ""; stream.on("data", chunk => { text += chunk.toString(); }); stream.on("end", () => { messages.push(text.replace(/=\r?\n/g, "").replace(/=3D/g, "=")); callback(); });
} });
await new Promise<void>(done => smtp.listen(25260, "127.0.0.1", done));
const inbox = createServer((_request, response) => { response.setHeader("content-type", "application/json"); response.end(JSON.stringify(messages)); });
await new Promise<void>(done => inbox.listen(3128, "127.0.0.1", done));
const child = spawn(process.execPath, ["--import", pathToFileURL(resolve("test/e2e-amap-preload.mjs")).href,
  "node_modules/next/dist/bin/next", "dev", "--webpack", "--port", "3127", "--hostname", "localhost"], {
  env: { ...process.env, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1" }, stdio: "inherit", windowsHide: true,
});
const close = () => { child.kill(); smtp.close(); inbox.close(); };
process.on("SIGINT", close); process.on("SIGTERM", close);
child.on("exit", code => { smtp.close(); inbox.close(); process.exitCode = code ?? 0; });
