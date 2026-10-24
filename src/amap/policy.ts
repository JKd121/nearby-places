/** Stage A evaluation candidates, not frozen production defaults.
 * Host boundary manually confirmed by the owner: Fluid Compute enabled, 300s,
 * no per-function maxDuration override. Do not configure the platform here.
 */
export const STAGE_A_POLICY = Object.freeze({
  upstreamTimeoutMs: 8_000,
  requestTimeoutMs: 60_000,
  maxResponseBytes: 1_048_576,
  maxRequestBytes: 65_536,
  hostMaxDurationMs: 300_000,
});
