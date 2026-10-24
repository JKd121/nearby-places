import { normalizeGeocodeCandidate, normalizePoiCandidates } from "./normalize.js";
import { routeLocationQuery } from "./router.js";
import { throwIfAborted, type RequestContext } from "../amap/request-context.js";
import { measureAsync, measureSync, type Diagnostics } from "../diagnostics.js";
import type { LocationResolverProvider, ResolutionResult } from "./types.js";

export async function resolveLocation(query: string, provider: LocationResolverProvider, diagnostics?: Diagnostics, context?: RequestContext): Promise<ResolutionResult> {
  throwIfAborted(context?.signal);
  const intent = routeLocationQuery(query);
  if (intent.kind === "ADDRESS_QUERY") {
    const geocoded = await measureAsync(diagnostics, "location.geocode", () => provider.geocode(intent.rawQuery, context));
    throwIfAborted(context?.signal);
    return geocoded ? { status: "confirmed", location: measureSync(diagnostics, "location.normalize", () => normalizeGeocodeCandidate(geocoded)) } : { status: "not_found", candidates: [] };
  }

  const providerCandidates = await measureAsync(diagnostics, "location.poi", () => provider.searchPlaceCandidates(intent.rawQuery, context));
  throwIfAborted(context?.signal);
  const candidates = measureSync(diagnostics, "location.normalize", () => normalizePoiCandidates(providerCandidates));
  return candidates.length > 0 ? { status: "needs_confirmation", candidates } : { status: "not_found", candidates: [] };
}
