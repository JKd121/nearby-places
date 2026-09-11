import "server-only";

import { createAmapClient } from "../amap/client.js";
import { createLocationResolverProvider } from "../location/provider.js";
import type { LocationResolverProvider } from "../location/types.js";

export class MissingServerKeyError extends Error {
  constructor() { super("AMAP_WEB_SERVICE_KEY is not configured on the server"); this.name = "MissingServerKeyError"; }
}

export function createServerAmapClient() {
  const key = process.env.AMAP_WEB_SERVICE_KEY;
  if (!key?.trim()) throw new MissingServerKeyError();
  return createAmapClient(key);
}

export function createServerLocationResolverProvider(): LocationResolverProvider {
  const key = process.env.AMAP_WEB_SERVICE_KEY;
  if (!key?.trim()) throw new MissingServerKeyError();
  return createLocationResolverProvider(key);
}
