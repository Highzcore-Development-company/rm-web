"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createRmServerBrowserClient } from "@/lib/supabase/rm-server-browser";

/**
 * Keeps the Overview figures current without a reload.
 *
 * The page is a server component, so every number on it froze at page load —
 * balance, equity, today, this week, win rate. An admin watching the account
 * was reading whenever they last pressed refresh.
 *
 * IT LISTENS TO bot_trades, not to a timer. That table is published to
 * realtime (bot migration 011) and it changes exactly when the figures do: a
 * trade opening or closing is the only thing that moves P&L, and closing is
 * also what makes the bot write a new equity snapshot. So the trigger is the
 * event itself rather than a guess about how often to ask.
 *
 * Deliberately NOT bot_market_state, which is also published but rewritten
 * every few seconds by the quote feed. Refreshing on that would re-run every
 * query behind this page twenty times a minute to change nothing.
 *
 * REFRESHES THE SERVER COMPONENT rather than recalculating here. The figures
 * are netted of commission and swap, bucketed into a Monday-to-Friday week,
 * and derived from two Supabase projects. Reimplementing that in the browser
 * would be a second source of truth that drifts from the first, and the two
 * disagreeing on a money screen is worse than either being stale.
 */

/**
 * The shortest gap between refreshes.
 *
 * Several trades can close in the same second — the bot manages the whole book
 * on one loop — and each would otherwise trigger its own full page refresh.
 */
const SETTLE_MS = 1_500;

/**
 * The fallback, deliberately slow.
 *
 * If the socket never connects — a proxy that blocks websockets, a dropped
 * connection nobody noticed — a dashboard that silently stops updating looks
 * exactly like a quiet market. Sixty seconds is too slow to be the main path
 * and fast enough that the screen is never badly wrong.
 */
const FALLBACK_MS = 60_000;

export function LiveStats() {
  const router = useRouter();
  const [live, setLive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const client = createRmServerBrowserClient();
    if (!client) return;

    let cancelled = false;

    const refresh = () => {
      if (cancelled) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (!cancelled) router.refresh();
      }, SETTLE_MS);
    };

    const channel = client
      .channel("admin-overview-trades")
      .on(
        "postgres_changes",
        // Every change: an INSERT is a trade opening, an UPDATE is it closing
        // or its stop moving. Both change what is on this page.
        { event: "*", schema: "public", table: "bot_trades" },
        refresh,
      )
      .subscribe((status: string) => {
        // Only claims to be live once the socket actually says so. A green dot
        // that means "we tried" is worse than no dot.
        if (!cancelled) setLive(status === "SUBSCRIBED");
      });

    const poll = setInterval(() => {
      if (!cancelled) router.refresh();
    }, FALLBACK_MS);

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      clearInterval(poll);
      void client.removeChannel(channel);
    };
  }, [router]);

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-fg-muted"
      // Polite: this changes while somebody is reading the page, and a screen
      // reader interrupting to say "live" is worse than it arriving late.
      aria-live="polite"
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${
          live ? "bg-chart-up" : "bg-fg-subtle"
        }`}
      />
      {/* Says which it is. "Updating when the bot trades" is a promise this
          can keep; "live" on a dead socket is not. */}
      {live ? "Updating as the bot trades" : "Checking every minute"}
    </span>
  );
}
