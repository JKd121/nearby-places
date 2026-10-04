import type { HistorySearchInput } from "../history/contracts.js";
import type { LocationCandidate } from "../location/types.js";
import { isHistorySearchInput } from "../history/validation.js";

export interface SearchHistoryItem {
  id: string;
  query: string;
  categoryIds: string[];
  radiusMeters: number;
  searchedAt: string;
  confirmedLocation: LocationCandidate;
}

export type SearchHistoryInput = HistorySearchInput;

export interface HistorySnapshot {
  items: SearchHistoryItem[];
  hasLoaded: boolean;
  hasMore: boolean;
  loading: boolean;
  pendingDeleteCount: number;
  loadError: string | null;
  deleteError: string | null;
}

export function isSearchHistoryItem(value: unknown): value is SearchHistoryItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return isHistorySearchInput(value) && typeof item.id === "string" && item.id.trim().length > 0 &&
    typeof item.searchedAt === "string" && Number.isFinite(Date.parse(item.searchedAt));
}

const CACHE_LIMIT = 20;
const VISIBLE_LIMIT = 10;
const FRESH_MS = 30_000;

class HistoryHttpError extends Error {
  constructor(readonly status: number) { super(`History request failed (${status})`); }
}

/** A single page's history. Nothing is persisted or shared between visitors/pages. */
export function createSearchHistoryStore(options: {
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  prefetchDelayMs?: number;
} = {}) {
  const fetcher = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const listeners = new Set<() => void>();
  const pendingDeletes = new Map<string, SearchHistoryItem>();
  let records: SearchHistoryItem[] = [];
  let snapshot: HistorySnapshot = {
    items: [], hasLoaded: false, hasMore: false, loading: false, pendingDeleteCount: 0,
    loadError: null, deleteError: null,
  };
  let active = false;
  let lastReadAt = -Infinity;
  let queue: Promise<unknown> = Promise.resolve();
  let pendingWrites = 0;
  let refillNeeded = false;
  let prefetchTimer: ReturnType<typeof setTimeout> | undefined;
  let refillTimer: ReturnType<typeof setTimeout> | undefined;
  let read: { controller: AbortController; promise: Promise<boolean> } | undefined;

  function publish(patch: Partial<HistorySnapshot> = {}) {
    snapshot = { ...snapshot, ...patch,
      items: records.filter((item) => !pendingDeletes.has(item.id)).slice(0, VISIBLE_LIMIT),
      pendingDeleteCount: pendingDeletes.size,
    };
    if (active) listeners.forEach((listener) => listener());
  }

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const task = queue.then(operation);
    queue = task.catch(() => undefined);
    return task;
  }

  async function request(method: string, body?: unknown, signal?: AbortSignal) {
    const controller = new AbortController();
    const cancel = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    const timer = setTimeout(() => controller.abort(new Error("History request timed out")), timeoutMs);
    let rejectAbort: () => void = () => {};
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener("abort", rejectAbort, { once: true });
      if (controller.signal.aborted) rejectAbort();
    });
    try {
      return await Promise.race([aborted, (async () => {
        const response = await fetcher(method === "GET" ? "/api/history?limit=20" : "/api/history", {
          method, credentials: "same-origin", cache: "no-store", signal: controller.signal,
          headers: body === undefined ? { accept: "application/json" } : { "content-type": "application/json" },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        if (!response.ok) throw new HistoryHttpError(response.status);
        return await response.json() as unknown;
      })()]);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      controller.signal.removeEventListener("abort", rejectAbort);
    }
  }

  async function readRecords(signal?: AbortSignal): Promise<SearchHistoryItem[]> {
    const payload = await request("GET", undefined, signal);
    if (!payload || typeof payload !== "object" || !("items" in payload) || !Array.isArray(payload.items)) {
      throw new Error("Invalid history response");
    }
    const seen = new Set<string>();
    return payload.items.filter((item): item is SearchHistoryItem => {
      if (!isSearchHistoryItem(item) || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }).slice(0, CACHE_LIMIT);
  }

  function refresh(force = false): Promise<boolean> {
    clearTimeout(prefetchTimer);
    if (!active) return Promise.resolve(false);
    if (read) return read.promise;
    if (!force && snapshot.hasLoaded && now() - lastReadAt < FRESH_MS) return Promise.resolve(true);
    const controller = new AbortController();
    publish({ loading: true, loadError: null });
    const current = { controller, promise: Promise.resolve(false) };
    read = current;
    current.promise = enqueue(async () => {
      if (controller.signal.aborted || !active) return false;
      try {
        const items = await readRecords(controller.signal);
        if (read !== current || !active) return false;
        records = items;
        lastReadAt = now();
        publish({ hasLoaded: true, hasMore: items.length === CACHE_LIMIT, loadError: null });
        return true;
      } catch {
        if (read === current && active && !controller.signal.aborted) {
          publish({ loadError: snapshot.hasLoaded || records.length > 0
            ? "暂时无法更新，已显示上次记录" : "读取历史记录失败，请重试" });
        }
        return false;
      } finally {
        if (read === current) {
          read = undefined;
          publish({ loading: false });
        }
      }
    });
    return current.promise;
  }

  function scheduleRefill() {
    if (!active || pendingWrites !== 0 || !refillNeeded) return;
    refillNeeded = false;
    clearTimeout(refillTimer);
    refillTimer = setTimeout(() => { void refresh(true); }, 0);
  }

  function restore(item: SearchHistoryItem) {
    if (!records.some((record) => record.id === item.id)) {
      records = [...records, item].sort((a, b) => Date.parse(b.searchedAt) - Date.parse(a.searchedAt)).slice(0, CACHE_LIMIT);
    }
  }

  function remove(id: string): Promise<void> {
    const item = records.find((record) => record.id === id);
    if (!active || !item || pendingDeletes.has(id)) return Promise.resolve();
    pendingDeletes.set(id, item);
    pendingWrites += 1;
    publish({ deleteError: null });
    return enqueue(async () => {
      try {
        const payload = await request("DELETE", { id });
        if (!payload || typeof payload !== "object" || !("deleted" in payload) || payload.deleted !== true) {
          throw new Error("Invalid delete response");
        }
        records = records.filter((record) => record.id !== id);
        refillNeeded = true;
      } catch (error) {
        const definiteFailure = error instanceof HistoryHttpError &&
          error.status >= 400 && error.status < 500 && error.status !== 404;
        if (definiteFailure) {
          restore(item);
          publish({ deleteError: "删除失败，已恢复这条记录，请重试" });
        } else {
          // A lost response may follow a committed delete. Check without retrying the write.
          try {
            const items = await readRecords();
            const coversItem = items.length < CACHE_LIMIT ||
              items.some((record) => Date.parse(record.searchedAt) < Date.parse(item.searchedAt));
            // A full newer window cannot establish whether the older target still exists.
            if (!items.some((record) => record.id === id) && !coversItem) throw new Error("History window does not cover item");
            records = items;
            lastReadAt = now();
            publish({ hasLoaded: true, hasMore: items.length === CACHE_LIMIT, loadError: null });
            if (items.some((record) => record.id === id) || !coversItem) throw new Error("Delete not confirmed");
            refillNeeded = true;
          } catch {
            restore(item);
            publish({ deleteError: "暂时无法确认删除结果，已恢复显示，请重试" });
          }
        }
      } finally {
        pendingDeletes.delete(id);
        pendingWrites -= 1;
        publish();
        scheduleRefill();
      }
    });
  }

  function save(input: SearchHistoryInput): Promise<void> {
    if (!active) return Promise.resolve();
    pendingWrites += 1;
    return enqueue(async () => {
      try {
        const payload = await request("POST", input);
        if (!payload || typeof payload !== "object" || !("item" in payload) || !isSearchHistoryItem(payload.item)) {
          throw new Error("Invalid saved history response");
        }
        const item = payload.item;
        records = [item, ...records.filter((record) => record.id !== item.id)].slice(0, CACHE_LIMIT);
        refillNeeded = true;
        publish();
      } catch (error) {
        console.warn("Failed to save search history", error);
      } finally {
        pendingWrites -= 1;
        scheduleRefill();
      }
    });
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start() {
      active = true;
      clearTimeout(prefetchTimer);
      prefetchTimer = setTimeout(() => { void refresh(); }, options.prefetchDelayMs ?? 200);
    },
    stop() {
      active = false;
      clearTimeout(prefetchTimer);
      clearTimeout(refillTimer);
      read?.controller.abort();
      read = undefined;
      publish({ loading: false });
    },
    refresh, remove, save,
  };
}
