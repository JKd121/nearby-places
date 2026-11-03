import test from "node:test";
import assert from "node:assert/strict";
import { verifyDeployment } from "../scripts/verify-deployment.mjs";

test("deployment check only reads homepage and sends invalid search input", async () => {
  const calls = [];
  const results = await verifyDeployment("https://example.test", { fetchImpl: async (url, options) => {
    calls.push({ path: url.pathname, options });
    return new Response("", { status: calls.length === 1 ? 200 : 400 });
  } });
  assert.deepEqual(results, ["/: 200", "/api/search: 400"]);
  assert.deepEqual(calls.map(x => x.path), ["/", "/api/search"]);
  assert.equal(calls[1].options.body, "{}");
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[0].options.redirect, "error");
  assert.ok(calls.every(x => x.options.signal instanceof AbortSignal));
});

test("deployment health and metadata failures stop verification", async () => {
  await assert.rejects(verifyDeployment("https://example.test", { fetchImpl: async () => new Response("", { status: 503 }) }), /received 503/);
  let calls = 0;
  await assert.rejects(verifyDeployment("https://example.test", {
    deploymentUrl: "https://fixture.vercel.app", expectedSha: "new-commit", token: "fixture-token", teamId: "fixture-team",
    fetchImpl: async () => { calls++; return Response.json({ readyState: "READY", meta: { githubCommitSha: "old-commit" } }); },
  }), /differs from verified commit/);
  assert.equal(calls, 1);
});

test("matching deployment is checked before public endpoints and credentials stay on Vercel API", async () => {
  const calls = [];
  await verifyDeployment("https://example.test", {
    deploymentUrl: "https://fixture.vercel.app", expectedSha: "commit", token: "fixture-token", teamId: "fixture-team",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.hostname === "api.vercel.com") return Response.json({ readyState: "READY", meta: { githubCommitSha: "commit" } });
      return new Response("", { status: url.pathname === "/" ? 200 : 400 });
    },
  });
  assert.equal(calls[0].url.hostname, "api.vercel.com");
  assert.equal(calls[0].options.headers.authorization, "Bearer fixture-token");
  assert.ok(calls.slice(1).every(x => !x.options.headers?.authorization));
});

test("unsafe targets and incomplete deployment identity are rejected before requests", async () => {
  const fetchImpl = async () => { throw new Error("unexpected network request"); };
  await assert.rejects(verifyDeployment("http://example.test", { fetchImpl }), /requires HTTPS/);
  await assert.rejects(verifyDeployment("https://example.test", { fetchImpl, expectedSha: "commit" }), /incomplete/);
  await assert.rejects(verifyDeployment("https://example.test", {
    fetchImpl, expectedSha: "commit", deploymentUrl: "https://untrusted.test", token: "fixture-token", teamId: "fixture-team",
  }), /Unexpected deployment URL/);
});
