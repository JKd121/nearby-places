import "server-only";

import { createAmapClientWithTransport } from "../amap/client.js";
import { createLocationResolverProviderWithTransport } from "../location/provider.js";
import { createAmapTransport } from "../amap/transport.js";
import type { RequestContext } from "../amap/request-context.js";
import type { Diagnostics } from "../diagnostics.js";
import { getRequestPolicy, type RequestPolicy } from "./request-policy.js";
import type { LocationResolverProvider } from "../location/types.js";
import { getServerAdmission } from "./admission.js";

export class MissingServerKeyError extends Error {
  constructor() { super("AMAP_WEB_SERVICE_KEY is not configured on the server"); this.name = "MissingServerKeyError"; }
}

export function createServerAmapClient(diagnostics?: Diagnostics, context?: RequestContext, policy: RequestPolicy = getRequestPolicy()) {
  const key = process.env.AMAP_WEB_SERVICE_KEY;
  if (!key?.trim()) throw new MissingServerKeyError();
  return createAmapClientWithTransport(key, createAmapTransport(undefined, { policy, beforeAttempt: getServerAdmission(process.env.AMAP_CREDENTIAL_ID ?? "primary"), ...(context ? { context } : {}), ...(diagnostics ? { diagnostics } : {}) }), diagnostics);
}

export function createServerLocationResolverProvider(diagnostics?: Diagnostics, context?: RequestContext, policy: RequestPolicy = getRequestPolicy()): LocationResolverProvider {
  const key = process.env.AMAP_WEB_SERVICE_KEY;
  if (!key?.trim()) throw new MissingServerKeyError();
  return createLocationResolverProviderWithTransport(key, createAmapTransport(undefined, { policy, beforeAttempt: getServerAdmission(process.env.AMAP_CREDENTIAL_ID ?? "primary"), ...(context ? { context } : {}), ...(diagnostics ? { diagnostics } : {}) }), diagnostics);
}
