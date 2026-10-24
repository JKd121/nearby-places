import { mapServerError } from "../server/http.js";

/** Keep provider diagnostics server-side; the resolver browser contract is generic. */
export function mapLocationResolverError(error: unknown): Response {
  return mapServerError(error);
}
