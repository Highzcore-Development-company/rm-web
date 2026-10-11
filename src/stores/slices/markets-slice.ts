import type { BotMarket } from "@/lib/workspace/types";

import type { SliceCreator } from "../types";

/**
 * What the bot is doing to each market, live.
 *
 * The rows arrive two ways and both land here: a Supabase Realtime payload per
 * write, and a slow poll that backs the socket up. Keeping them in the store
 * rather than inside the subscribing hook means anything on the page can read
 * the live feed — the header, a badge, a future Scora answer — without a
 * second subscription to the same table.
 *
 * `hydrated` is the honest signal for "the client has its own data now". Until
 * it flips, consumers fall back to the server-rendered snapshot they were
 * given as a prop, so the first client render matches the server's HTML
 * exactly and there is no hydration mismatch.
 */

export type MarketsSlice = {
  markets: BotMarket[];
  hydrated: boolean;
  /** Replace everything — the server snapshot, or a poll's full result. */
  setMarkets: (rows: BotMarket[]) => void;
  /** Apply one Realtime row. */
  mergeMarket: (row: BotMarket) => void;
};

export const createMarketsSlice: SliceCreator<MarketsSlice> = (set) => ({
  markets: [],
  hydrated: false,

  setMarkets: (rows) => set({ markets: rows, hydrated: true }, false, "markets/set"),

  mergeMarket: (row) =>
    set(
      (s) => {
        const i = s.markets.findIndex((m) => m.symbol === row.symbol);
        if (i === -1) return { markets: [...s.markets, row], hydrated: true };

        // MERGE, don't replace. A Realtime payload carries the columns that
        // changed; assigning it wholesale blanks every field that did not.
        const next = s.markets.slice();
        next[i] = { ...next[i], ...row };
        return { markets: next, hydrated: true };
      },
      false,
      "markets/merge",
    ),
});
