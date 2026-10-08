"use client";

import { useEffect, useState } from "react";
import { createRmServerBrowserClient } from "@/lib/supabase/rm-server-browser";
import type { BotMarket } from "@/lib/workspace/types";

/**
 * The Activities feed, live.
 *
 * The desk is server-rendered once, so every row froze at page load and the
 * feed showed what the bot was thinking five minutes ago. The whole point of
 * that tab is watching the bot work, and a snapshot is not that.
 *
 * Realtime rather than polling. rm-server already publishes this table —
 * migration 011 added bot_market_state to supabase_realtime and set its
 * replica identity, with the stated aim of letting "the dashboard hear writes
 * instead of asking for them". One websocket carries all 17 markets; polling
 * them every few seconds would be 20+ requests a minute against a free tier
 * the chart is already spending on quotes.
 *
 * Nothing changes on the bot's side. quote_feed writes this table roughly
 * every three seconds whatever is listening; this only stops the browser
 * waiting for a page load to hear about it.
 *
 * A POLL BACKS IT UP, deliberately slow. If the socket never connects — a
 * proxy that blocks websockets, a dropped connection nobody noticed — a feed
 * that silently stops updating looks exactly like a bot that stopped working.
 * Thirty seconds is too slow to be the main path and fast enough that the
 * screen is never badly wrong.
 */
export function useLiveMarkets(initial: BotMarket[]): BotMarket[] {
  const [markets, setMarkets] = useState(initial);

  useEffect(() => {
    const supabase = createRmServerBrowserClient();

    const merge = (row: BotMarket) =>
      setMarkets((prev) => {
        const next = prev.slice();
        const i = next.findIndex((m) => m.symbol === row.symbol);
        // Merge rather than replace: a realtime payload carries the columns
        // that changed, and dropping the rest would blank half the row.
        if (i === -1) next.push(row);
        else next[i] = { ...next[i], ...row };
        return next;
      });

    const channel = supabase
      .channel("desk-market-state")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bot_market_state" },
        // Typed explicitly: the stubbed client used when rm-server is
        // unconfigured cannot carry the generic that would infer this.
        (payload: { new: unknown }) => {
          const row = payload.new as BotMarket | null;
          if (row?.symbol) merge(row);
        },
      )
      .subscribe();

    const refetch = async () => {
      const { data } = await supabase.from("bot_market_state").select("*");
      if (data?.length) setMarkets(data as BotMarket[]);
    };
    const id = setInterval(refetch, 30_000);

    return () => {
      clearInterval(id);
      supabase.removeChannel(channel);
    };
  }, []);

  return markets;
}
