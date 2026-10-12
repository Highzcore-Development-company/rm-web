"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";

import { createAppStore, type AppStore } from "./create-app-store";
import type { AppState } from "./types";

/**
 * Owns the one store instance for this request / this browser tab.
 *
 * See create-app-store.ts for why the store is not a module-level singleton.
 * This provider is the mechanism that keeps it per-request: React context is
 * created fresh for every render tree, so a store held in it cannot outlive
 * the request that made it.
 */

const StoreContext = createContext<AppStore | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  // A LAZY useState INITIALIZER, not a ref. Both create the store exactly
  // once, but reading `ref.current` during render is something React can no
  // longer guarantee is safe — the compiler lint rejects it outright. The
  // initializer runs on the first render only and the value is never set
  // again, so the store is as stable as the ref was and the rule is honoured.
  //
  // It must never be recreated: a new store would reset every rail, tab and
  // live row on an unrelated re-render.
  const [store] = useState(createAppStore);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

/**
 * Read from the store with a selector.
 *
 * ALWAYS SELECT THE NARROWEST THING YOU NEED. `useAppStore((s) => s)` makes a
 * component re-render on every change anywhere in the store, including a toast
 * timing out while the user is reading a chart.
 *
 *     const tab = useAppStore((s) => s.deskTab);          // re-renders on tab
 *     const { markets } = useAppStore((s) => s);          // re-renders always
 *
 * Selecting an object or array literal re-renders every time too, because the
 * new reference never equals the old one. Select the fields separately, or use
 * `useShallow` from zustand/react/shallow.
 */
export function useAppStore<T>(selector: (state: AppState) => T): T {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error(
      "useAppStore must be used inside <StoreProvider>. It is mounted in " +
        "src/app/layout.tsx; a component rendering outside that tree needs " +
        "its own provider.",
    );
  }
  return useStore(store, selector);
}

/**
 * The store instance itself, for the rare caller that needs `getState` or
 * `subscribe` outside React — an effect that must read the latest value
 * without re-subscribing, for instance. Prefer `useAppStore`.
 */
export function useAppStoreApi(): AppStore {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error("useAppStoreApi must be used inside <StoreProvider>");
  }
  return store;
}
