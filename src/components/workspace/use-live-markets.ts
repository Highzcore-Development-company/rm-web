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
/**
 * ONE SUBSCRIPTION, however many components ask for the feed.
 *
 * This is reference-counted at module scope rather than owned by the hook, and
 * it has to be. @supabase/ssr's createBrowserClient is a singleton per browser,
 * and a Supabase client hands back the SAME channel object for a given topic —
 * so a second component calling `.channel("desk-market-state").on(...)` is
 * adding a listener to a channel the first one has already subscribed, which
 * throws outright:
 *
 *   cannot add `postgres_changes` callbacks for realtime:desk-market-state
 *   after `subscribe()`
 *
 * That took down /app/admin/bot, where the admin layout's live figure and the
 * page's own <Desk> both want the feed. Two mounts, one channel, one of them
 * too late.
 *
 * Unique topics per mount would also have silenced it, at the cost of a second
 * websocket and a second copy of every row — which is the thing the comment
 * above already said this hook exists to avoid. So the first mount opens the
 * socket, the last one to leave closes it, and everyone in between just reads
 * the store.
 */
let subscribers = 0;
let channel: ReturnType<
  ReturnType<typeof createRmServerBrowserClient>["channel"]
> | null = null;
let pollId: ReturnType<typeof setInterval> | null = null;

export function useLiveMarkets(initial: BotMarket[]): BotMarket[] {
  const setMarkets = useSetMarkets();
  const mergeMarket = useMergeMarket();

  useEffect(() => {
    subscribers += 1;

    // Only the first mount wires anything up. Guarded on the channel as well
    // as the count because React's development double-mount can run this
    // again before the previous cleanup has finished.
    if (subscribers === 1 && !channel) {
      const supabase = createRmServerBrowserClient();

      channel = supabase
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
      pollId = setInterval(refetch, 30_000);
    }

    return () => {
      subscribers -= 1;
      // Never below zero: a cleanup that ran twice would otherwise leave the
      // count negative and the next mount would not re-subscribe.
      if (subscribers > 0) return;
      subscribers = 0;

      if (pollId !== null) {
        clearInterval(pollId);
        pollId = null;
      }
      if (channel) {
        createRmServerBrowserClient().removeChannel(channel);
        channel = null;
      }
    };
    // Store actions are stable for the life of the store, so this runs once per
    // mount — the socket must not be torn down and rebuilt on re-render.
  }, [setMarkets, mergeMarket]);

  // Falls back to the server snapshot until the store has its own rows, so
  // the first client render matches the server's HTML exactly.
  return useMarkets(initial);
}
