import { isSearchHistoryItem, type SearchHistoryItem } from "./search-history-store.js";
import { isHistorySearchInput } from "../history/validation.js";

export const GUEST_HISTORY_KEY = "nearby.guest.history.v1";
const dedupe = (item: { query: string; categoryIds: string[]; radiusMeters: number; confirmedLocation: SearchHistoryItem["confirmedLocation"] }) =>
  JSON.stringify([item.query.trim().replace(/\s+/g, " "), [...new Set(item.categoryIds)].sort(), item.radiusMeters, item.confirmedLocation.location.longitude, item.confirmedLocation.location.latitude]);
export function localHistoryFetch(storage: Pick<Storage, "getItem" | "setItem">): typeof fetch {
  return async (_input, options) => {
    let items: SearchHistoryItem[] = [];
    try { const parsed: unknown = JSON.parse(storage.getItem(GUEST_HISTORY_KEY) ?? "[]"); if (Array.isArray(parsed)) items = parsed.filter(isSearchHistoryItem).slice(0, 20); } catch { /* Recover corrupt local history. */ }
    if (options?.method === "POST") {
      const body: unknown = JSON.parse(String(options.body));
      if (!isHistorySearchInput(body)) return Response.json({}, { status: 400 });
      const item: SearchHistoryItem = { ...body, id: crypto.randomUUID(), searchedAt: new Date().toISOString() };
      items = [item, ...items.filter(previous => dedupe(previous) !== dedupe(item))].slice(0, 20);
      storage.setItem(GUEST_HISTORY_KEY, JSON.stringify(items));
      return Response.json({ item });
    }
    if (options?.method === "DELETE") {
      const body = JSON.parse(String(options.body)) as { id: string };
      storage.setItem(GUEST_HISTORY_KEY, JSON.stringify(items.filter(item => item.id !== body.id)));
      return Response.json({ deleted: true });
    }
    return Response.json({ items });
  };
}
