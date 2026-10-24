import type { TransportPolicy } from "../amap/transport.js";
import { STAGE_A_POLICY } from "../amap/policy.js";

export interface RequestPolicy extends TransportPolicy { requestTimeoutMs: number; maxRequestBytes: number; }
export class RequestPolicyError extends Error {
  constructor() { super("Request safety policy requires deployment verification"); this.name = "RequestPolicyError"; }
}

/** Defaults are the owner's Stage A candidates; optional explicit overrides fail closed. */
export function getRequestPolicy(env: Readonly<Record<string, string | undefined>> = process.env): RequestPolicy {
  const names = ["AMAP_UPSTREAM_TIMEOUT_MS", "AMAP_REQUEST_TIMEOUT_MS", "AMAP_MAX_RESPONSE_BYTES", "AMAP_HOST_MAX_DURATION_MS"] as const;
  if (names.every(name => env[name] === undefined)) return { ...STAGE_A_POLICY };
  const [upstreamTimeoutMs, requestTimeoutMs, maxResponseBytes, hostMs] = names.map(name => Number(env[name]));
  if (![upstreamTimeoutMs, requestTimeoutMs, maxResponseBytes, hostMs].every(value => Number.isSafeInteger(value) && value! > 0 && value! <= 2_147_483_647)) throw new RequestPolicyError();
  if (upstreamTimeoutMs! > requestTimeoutMs! || requestTimeoutMs! + Math.max(1_000, Math.ceil(hostMs! * 0.1)) > hostMs!) throw new RequestPolicyError();
  return { upstreamTimeoutMs: upstreamTimeoutMs!, requestTimeoutMs: requestTimeoutMs!, maxResponseBytes: maxResponseBytes!, maxRequestBytes: STAGE_A_POLICY.maxRequestBytes };
}
