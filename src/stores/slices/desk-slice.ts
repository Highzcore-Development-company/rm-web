import type { SliceCreator } from "../types";

/**
 * How the desk is arranged: which rails are open, which feed tab is showing.
 *
 * This lived in three useState calls inside desk.tsx, which meant it was lost
 * on every navigation — collapse Scora, open a trade, come back, and it is
 * expanded again. It is preference, not page data, so it belongs to the
 * session rather than to one mount of one component.
 *
 * NOT PERSISTED TO localStorage, deliberately. zustand/persist reads storage
 * after hydration, so the first client render disagrees with the server's HTML
 * and either React warns about a mismatch or the rail visibly snaps shut a
 * frame later. The fix is `skipHydration` plus a rehydrate effect, which trades
 * the warning for a flash. Neither is worth it to remember a collapsed panel —
 * revisit if the desk grows state that is genuinely expensive to re-choose.
 */

/**
 * HS-BOT-v4 §2 — the sections of the feed rail.
 *
 * "market" was called "activities": same content, the name the brief uses.
 * "performance" is new. Chart is the centre column rather than a tab, and
 * Settings lives in the profile menu, which is the other two of the six.
 */
export type DeskTab = "market" | "live" | "history" | "performance";

export type DeskSlice = {
  scoraOpen: boolean;
  feedOpen: boolean;
  deskTab: DeskTab;
  setScoraOpen: (open: boolean) => void;
  setFeedOpen: (open: boolean) => void;
  setDeskTab: (tab: DeskTab) => void;
  // Explicit toggles rather than setters that accept a `(prev) => next`
  // updater. useState's updater form is a React convention; a store action
  // that takes either a value or a function is two signatures pretending to
  // be one, and the call site reads worse for it.
  toggleScora: () => void;
  toggleFeed: () => void;
};

export const createDeskSlice: SliceCreator<DeskSlice> = (set) => ({
  // Both rails start open: the desk's whole point is that the chart, Scora and
  // the feed are visible at once. Collapsing is the exception.
  scoraOpen: true,
  feedOpen: true,
  // Market, not Live: an empty Live list says nothing, where Market always
  // has something to read even when the bot holds no position.
  deskTab: "market",

  setScoraOpen: (open) => set({ scoraOpen: open }, false, "desk/scoraOpen"),
  setFeedOpen: (open) => set({ feedOpen: open }, false, "desk/feedOpen"),
  setDeskTab: (tab) => set({ deskTab: tab }, false, "desk/tab"),

  toggleScora: () => set((s) => ({ scoraOpen: !s.scoraOpen }), false, "desk/toggleScora"),
  toggleFeed: () => set((s) => ({ feedOpen: !s.feedOpen }), false, "desk/toggleFeed"),
});
