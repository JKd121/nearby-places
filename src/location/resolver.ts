import { measureAsync, measureSync, type Diagnostics } from "../diagnostics.js";
import { normalizeGeocodeCandidate, normalizePoiCandidates } from "./normalize.js";
import { routeLocationQuery } from "./router.js";
import type { LocationResolverProvider, ResolutionResult } from "./types.js";

export async function resolveLocation(query: string, provider: LocationResolverProvider, diagnostics?: Diagnostics): Promise<ResolutionResult> {
  const intent = routeLocationQuery(query);
  if (intent.kind === "ADDRESS_QUERY") {
    const geocoded = await measureAsync(diagnostics, "location.geocode", () => provider.geocode(intent.rawQuery));
    return geocoded ? { status: "confirmed", location: measureSync(diagnostics, "location.normalize", () => normalizeGeocodeCandidate(geocoded)) } : { status: "not_found", candidates: [] };
  }

  const providerCandidates = await measureAsync(diagnostics, "location.poi", () => provider.searchPlaceCandidates(intent.rawQuery));
  const candidates = measureSync(diagnostics, "location.normalize", () => normalizePoiCandidates(providerCandidates));
  return candidates.length > 0 ? { status: "needs_confirmation", candidates } : { status: "not_found", candidates: [] };
}
