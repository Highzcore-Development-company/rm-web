"use client";

import { useCallback } from "react";

import type { BotMarket } from "@/lib/workspace/types";

import { useAppStore } from "./store-provider";
import type { DeskTab } from "./slices/desk-slice";

/**
 * The hooks features actually import.
 *
 * Components do not call `useAppStore` with their own selectors as a rule —
 * they call one of these. Two reasons, and both are about what happens in six
 * months rather than today:
 *
 *   The selector is written once. `(s) => s.deskTab` typed in nine components
 *   is nine places to update when the slice is reshaped, and nine chances to
 *   accidentally select the whole store and re-render on every toast.
 *
 *   The store stays replaceable. Everything outside this folder depends on
 *   `useDeskTab()`, not on Zustand. Swapping the implementation — or moving a
 *   slice to the server — touches this file and nothing else.
 *
 * Each hook selects one value. That is what keeps re-renders tight: a chart
 * reading `useMarkets()` does not re-render because a toast appeared.
 */

/* ------------------------------------------------------------------ toast */

export type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
};

/**
 * Unchanged from the Context version it replaces, so its 14 call sites did
 * not have to be touched.
 */
export function useToast(): ToastApi {
  const push = useAppStore((s) => s.pushToast);

  const success = useCallback((message: string) => push(message, "success"), [push]);
  const error = useCallback((message: string) => push(message, "error"), [push]);

  // Identity is stable: `push` is a store action and never changes, so these
  // are safe in a dependency array.
  return { success, error };
}

/** For the viewport component only. Everything else pushes, not reads. */
export const useToasts = () => useAppStore((s) => s.toasts);
export const useDismissToast = () => useAppStore((s) => s.dismissToast);

/* ------------------------------------------------------------------- desk */

export const useScoraOpen = () => useAppStore((s) => s.scoraOpen);
export const useSetScoraOpen = () => useAppStore((s) => s.setScoraOpen);

export const useFeedOpen = () => useAppStore((s) => s.feedOpen);
export const useSetFeedOpen = () => useAppStore((s) => s.setFeedOpen);
export const useToggleScora = () => useAppStore((s) => s.toggleScora);
export const useToggleFeed = () => useAppStore((s) => s.toggleFeed);

export const useDeskTab = (): DeskTab => useAppStore((s) => s.deskTab);
export const useSetDeskTab = () => useAppStore((s) => s.setDeskTab);

/* ---------------------------------------------------------------- markets */

/**
 * Live market rows, falling back to the server snapshot until the client has
 * its own.
 *
 * The fallback is what prevents a hydration mismatch. The server rendered
 * `snapshot`; the client's first render has an empty store, so without this it
 * would render nothing and React would see two different trees. Passing the
 * same snapshot through until `hydrated` flips keeps both renders identical.
 */
export function useMarkets(snapshot: BotMarket[]): BotMarket[] {
  const markets = useAppStore((s) => s.markets);
  const hydrated = useAppStore((s) => s.hydrated);
  return hydrated ? markets : snapshot;
}

export const useSetMarkets = () => useAppStore((s) => s.setMarkets);
export const useMergeMarket = () => useAppStore((s) => s.mergeMarket);
