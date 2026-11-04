import { test } from "node:test";
import assert from "node:assert/strict";
import { Socket } from "node:net";
import "./api-isolation.mjs";

test("API isolation refuses unmocked fetch and TCP before any network I/O", async () => {
  await assert.rejects(fetch("https://example.invalid"), /install an explicit fetch mock/);
  const socket = new Socket();
  try { assert.throws(() => socket.connect(1, "127.0.0.1"), /real sockets are disabled/); }
  finally { socket.destroy(); }
});
