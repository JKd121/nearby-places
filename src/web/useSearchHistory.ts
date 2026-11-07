"use client";
import { localHistoryFetch } from "./local-history.js";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createSearchHistoryStore } from "./search-history-store.js";

export function useSearchHistory(kind: "guest" | "account" = "account", sessionId?: string) {
  const [store] = useState(() => createSearchHistoryStore(kind === "guest" ? { fetch: (...args) => localHistoryFetch(window.localStorage)(...args) } : { ...(sessionId ? { sessionId } : {}) }));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);
  return { ...state, refresh: store.refresh, remove: store.remove, save: store.save };
}
