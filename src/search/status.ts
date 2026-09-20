import type { Place, PlacePage } from "../amap/types.js";

/**
 * A filtered page can contain no accepted places while the provider still has
 * another raw page to inspect. Keep that state successful so page 2 remains
 * eligible; only report empty after the provider is exhausted.
 */
export function deriveCategoryStatus(places: readonly Place[], page: Pick<PlacePage, "returnedCount" | "mayHaveNextApiPage">): "success" | "empty" {
  if (places.length > 0) return "success";
  return page.returnedCount > 0 && page.mayHaveNextApiPage ? "success" : "empty";
}
