"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createSearchHistoryStore } from "./search-history-store.js";

export function useSearchHistory() {
  const [store] = useState(() => createSearchHistoryStore());
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);
  return { ...state, refresh: store.refresh, remove: store.remove, save: store.save };
}
