import { createStore } from "zustand/vanilla";
import { devtools } from "zustand/middleware";

import { createDeskSlice } from "./slices/desk-slice";
import { createMarketsSlice } from "./slices/markets-slice";
import { createToastSlice } from "./slices/toast-slice";
import type { AppState } from "./types";

/**
 * Build one store. Called PER REQUEST, never at module scope.
 *
 * WHY THAT MATTERS HERE MORE THAN IN MOST APPS. A `"use client"` component is
 * still rendered on the server for the initial HTML, and a module-level store
 * is created once per server process — so it is shared by every request that
 * process handles. One investor's markets, toasts, or anything added later
 * could be rendered into another investor's page. On a platform where people
 * log in to see their own money, that is a data leak, not a glitch.
 *
 * `createStore` from zustand/vanilla rather than the React `create`: this
 * returns a plain store instance for the provider to own, with no hook bound
 * to module state.
 *
 * devtools is wired in all environments but names every action (the third
 * argument to `set` in each slice). It is a no-op without the Redux DevTools
 * extension installed, so it costs nothing in production and means a
 * misbehaving store can be read in the browser rather than guessed at.
 */
export const createAppStore = () =>
  createStore<AppState>()(
    devtools(
      (...a) => ({
        ...createToastSlice(...a),
        ...createDeskSlice(...a),
        ...createMarketsSlice(...a),
      }),
      { name: "rm-web", enabled: process.env.NODE_ENV !== "production" },
    ),
  );

export type AppStore = ReturnType<typeof createAppStore>;
