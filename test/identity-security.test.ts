import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { encryptCredential, decryptCredential, fingerprint, signGuest, verifyGuest, trustedOrigin, trustedIp } from "../src/identity/security.js";

process.env.NEARBY_CREDENTIAL_KEYS = JSON.stringify({ "1": "11".repeat(32), "2": "22".repeat(32) });
process.env.NEARBY_CREDENTIAL_KEY_VERSION = "1";
process.env.NEARBY_GUEST_SECRET = "guest-test-secret-".repeat(3);
process.env.NEARBY_FINGERPRINT_SECRET = "fingerprint-test-secret-".repeat(3);
test("guest identities reject tampering, expiration and old unsigned cookies", () => {
  const id = randomUUID(), token = signGuest(id, Date.now() + 10000);
  assert.equal(verifyGuest(token), id);
  assert.equal(verifyGuest(token.slice(0, -1) + "!"), null);
  assert.equal(verifyGuest(signGuest(id, Date.now() - 1)), null);
  assert.equal(verifyGuest(id), null);
  assert.equal(verifyGuest(token.replace(id, randomUUID())), null);
});
test("authenticated encryption isolates users, randomizes ciphertext and rejects corruption", () => {
  const key = "a".repeat(32), a = encryptCredential(key, "user-a"), b = encryptCredential(key, "user-a");
  assert.notEqual(a.encryptedKey, b.encryptedKey);
  assert.equal(a.encryptedKey.includes(key), false);
  assert.equal(decryptCredential({ ...a, userId: "user-a" }), key);
  assert.throws(() => decryptCredential({ ...a, userId: "user-b" }));
  const bytes = Buffer.from(a.encryptedKey, "base64"); bytes[bytes.length - 1]! ^= 1;
  assert.throws(() => decryptCredential({ ...a, encryptedKey: bytes.toString("base64"), userId: "user-a" }));
});
test("encryption versions support rotation while old ciphertext remains readable", () => {
  const a = encryptCredential("b".repeat(32), "user-a");
  process.env.NEARBY_CREDENTIAL_KEY_VERSION = "2";
  const b = encryptCredential("b".repeat(32), "user-a");
  assert.equal(b.encryptionVersion, 2);
  assert.equal(decryptCredential({ ...a, userId: "user-a" }), decryptCredential({ ...b, userId: "user-a" }));
  process.env.NEARBY_CREDENTIAL_KEY_VERSION = "1";
});
test("missing encryption material and malformed ciphertext produce safe fixed errors", () => {
  assert.throws(() => decryptCredential({ userId: "a", encryptedKey: "broken-SECRET", encryptionVersion: 9 }), error => error instanceof Error && !error.message.includes("SECRET"));
  assert.throws(() => decryptCredential({ userId: "a", encryptedKey: "broken-SECRET", encryptionVersion: 1 }), /读取失败/);
});
test("fingerprints share a key scope and separate logging purposes", () => {
  assert.equal(fingerprint("key"), fingerprint("key"));
  assert.notEqual(fingerprint("key"), fingerprint("key", "ip"));
  assert.notEqual(fingerprint("key"), fingerprint("other"));
});
test("write origin is fixed to configured application origin", () => {
  process.env.BETTER_AUTH_URL = "https://nearby.example";
  trustedOrigin(new Request("https://nearby.example/api/fixture", { headers: { origin: "https://nearby.example" } }));
  assert.throws(() => trustedOrigin(new Request("https://nearby.example/api/fixture", { headers: { origin: "https://attacker.example" } })));
  assert.throws(() => trustedOrigin(new Request("https://nearby.example/api/fixture")));
});
test("local IP limiting ignores forged forwarding headers", () => {
  delete process.env.VERCEL;
  assert.equal(trustedIp(new Headers({ "x-forwarded-for": "1.2.3.4" })), trustedIp(new Headers({ "x-forwarded-for": "5.6.7.8" })));
});
