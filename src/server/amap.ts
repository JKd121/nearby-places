import "server-only";

import { createAmapClientWithTransport } from "../amap/client.js";
import { createLocationResolverProviderWithTransport } from "../location/provider.js";
import { createAmapTransport } from "../amap/transport.js";
import type { RequestContext } from "../amap/request-context.js";
import type { Diagnostics } from "../diagnostics.js";
import { getRequestPolicy, type RequestPolicy } from "./request-policy.js";
import type { LocationResolverProvider } from "../location/types.js";
import { IdentityError } from "../identity/security.js";
import type { ServerAmapAccess } from "./amap-access.js";

export class MissingServerKeyError extends Error {
  constructor() { super("AMAP_WEB_SERVICE_KEY is not configured on the server"); this.name = "MissingServerKeyError"; }
}

export function createServerAmapClient(diagnostics?: Diagnostics, context?: RequestContext, policy: RequestPolicy = getRequestPolicy(), access?: ServerAmapAccess) {
  if (!access) throw new IdentityError("IDENTITY_REQUIRED", 401, "请选择匿名体验或登录账户");
  const key = access.key;
  return createAmapClientWithTransport(key, createAmapTransport(undefined, { policy, ...access.options, beforeAttempt: access.options.beforeAttempt, ...(context ? { context } : {}), ...(diagnostics ? { diagnostics } : {}) }), diagnostics);
}

export function createServerLocationResolverProvider(diagnostics?: Diagnostics, context?: RequestContext, policy: RequestPolicy = getRequestPolicy(), access?: ServerAmapAccess): LocationResolverProvider {
  if (!access) throw new IdentityError("IDENTITY_REQUIRED", 401, "请选择匿名体验或登录账户");
  const key = access.key;
  return createLocationResolverProviderWithTransport(key, createAmapTransport(undefined, { policy, ...access.options, beforeAttempt: access.options.beforeAttempt, ...(context ? { context } : {}), ...(diagnostics ? { diagnostics } : {}) }), diagnostics);
}
