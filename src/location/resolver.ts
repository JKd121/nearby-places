import { normalizeGeocodeCandidate, normalizePoiCandidates } from "./normalize.js";
import { routeLocationQuery } from "./router.js";
import type { LocationResolverProvider, ResolutionResult } from "./types.js";

export async function resolveLocation(query: string, provider: LocationResolverProvider): Promise<ResolutionResult> {
  const intent = routeLocationQuery(query);
  if (intent.kind === "ADDRESS_QUERY") {
    const geocoded = await provider.geocode(intent.rawQuery);
    return geocoded ? { status: "confirmed", location: normalizeGeocodeCandidate(geocoded) } : { status: "not_found", candidates: [] };
  }

  const providerCandidates = await provider.searchPlaceCandidates(intent.rawQuery);
  const candidates = normalizePoiCandidates(providerCandidates);
  return candidates.length > 0 ? { status: "needs_confirmation", candidates } : { status: "not_found", candidates: [] };
}
