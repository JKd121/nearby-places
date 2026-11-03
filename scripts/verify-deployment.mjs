import { fileURLToPath } from "node:url";

// Invalid input keeps this check independent of AMap and history writes.
export async function verifyDeployment(target, { fetchImpl = fetch, deploymentUrl, expectedSha, token, teamId } = {}) {
  const base = new URL(target);
  if (base.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(base.hostname)) {
    throw new Error("Deployment verification requires HTTPS or a loopback fixture");
  }
  const request = (url, options = {}) => fetchImpl(url, { ...options, signal: AbortSignal.timeout(15_000), redirect: "error" });
  if (expectedSha) {
    if (!deploymentUrl || !token || !teamId) throw new Error("Deployment identity configuration is incomplete");
    const deployment = new URL(deploymentUrl);
    if (deployment.protocol !== "https:" || !deployment.hostname.endsWith(".vercel.app")) throw new Error("Unexpected deployment URL");
    const api = new URL(`https://api.vercel.com/v13/deployments/${deployment.hostname}`);
    api.searchParams.set("teamId", teamId);
    const response = await request(api, { headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Deployment metadata returned ${response.status}`);
    const data = await response.json();
    if (data.readyState !== "READY" || data.meta?.githubCommitSha !== expectedSha) throw new Error("Production deployment differs from verified commit");
  }
  const results = [];
  for (const [path, expected, options] of [
    ["/", 200, {}],
    ["/api/search", 400, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }],
  ]) {
    const response = await request(new URL(path, base), options);
    await response.body?.cancel();
    if (response.status !== expected) throw new Error(`${path}: expected ${expected}, received ${response.status}`);
    results.push(`${path}: ${response.status}`);
  }
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const results = await verifyDeployment(process.argv[2], {
    deploymentUrl: process.env.DEPLOYMENT_URL, expectedSha: process.env.GITHUB_SHA,
    token: process.env.VERCEL_TOKEN, teamId: process.env.VERCEL_ORG_ID,
  });
  for (const result of results) console.log(result);
}
