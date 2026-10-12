"use client";

import { useEffect } from "react";
import { createRmServerBrowserClient } from "@/lib/supabase/rm-server-browser";
import { useMarkets, useMergeMarket, useSetMarkets } from "@/stores";
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
 *
 * THE ROWS LIVE IN THE STORE NOW, not in this hook's useState. The hook is
 * still the only thing that subscribes — one socket, one place that owns the
 * connection — but anything on the page can now read the live feed without
 * opening a second subscription to the same table. The signature is unchanged
 * so the desk did not have to care.
 */
export function useLiveMarkets(initial: BotMarket[]): BotMarket[] {
  const setMarkets = useSetMarkets();
  const mergeMarket = useMergeMarket();

  useEffect(() => {
    const supabase = createRmServerBrowserClient();

    const channel = supabase
      .channel("desk-market-state")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bot_market_state" },
        // Typed explicitly: the stubbed client used when rm-server is
        // unconfigured cannot carry the generic that would infer this.
        (payload: { new: unknown }) => {
          const row = payload.new as BotMarket | null;
          if (row?.symbol) mergeMarket(row);
        },
      )
      .subscribe();

    const refetch = async () => {
      const { data } = await supabase.from("bot_market_state").select("*");
      if (data?.length) setMarkets(data as BotMarket[]);
    };
    const id = setInterval(refetch, 30_000);
    const onVisible = () => { if (document.visibilityState === "visible") void refetch(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
    // Store actions are stable for the life of the store, so this runs once —
    // the socket must not be torn down and rebuilt on re-render.
  }, [setMarkets, mergeMarket]);

  // Falls back to the server snapshot until the store has its own rows, so
  // the first client render matches the server's HTML exactly.
  return useMarkets(initial);
}
