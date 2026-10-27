"use client";

import Link from "next/link";
import { ArrowUpRight, Hourglass } from "lucide-react";
import { useLiveMarkets } from "@/components/workspace/use-live-markets";
import { useDismissable } from "@/components/admin/shell/use-dismissable";
import { formatPrice } from "@/lib/price";
import type { BotMarket } from "@/lib/workspace/types";

/**
 * Setups lined up but not yet triggered, in the navbar.
 *
 * Victor: "Since pending doesn't have [a page]. add it to the navbar which
 * using an icon as if it's notification to show how many is pending then click
 * to see the dropdown of pending markets. When we click the market it goes to
 * the chart."
 *
 * A COUNT, not money — and that is the difference from the live bell beside
 * it. A pending setup has no P&L yet; what matters is how many there are and on
 * what, so the badge is a number and the rows carry the level the bot is
 * waiting at. The live bell is the opposite: the count is almost irrelevant and
 * the floating figure is the whole point.
 *
 * `state === "ready"` is what pending means. The bot sets it when price has
 * reached the level its routed strategy trades off and it is waiting on
 * confirmation — the same test the entry path runs, so this and the trade
 * decision cannot disagree.
 *
 * Shares one realtime subscription with the live bell; useLiveMarkets
 * reference-counts it.
 */
export function PendingBell({ initial }: { initial: BotMarket[] }) {
  const markets = useLiveMarkets(initial);
  const { open, setOpen, ref, hoverProps } = useDismissable();

  const waiting = markets.filter((m) => m.state === "ready");
  const count = waiting.length;

  return (
    <div className="relative" ref={ref} {...hoverProps}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={
          count === 0
            ? "No setups waiting"
            : `${count} ${count === 1 ? "setup" : "setups"} waiting to enter`
        }
        className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm tabular-nums transition-colors hover:bg-surface ${
          count > 0
            ? "border border-brand/40 text-brand"
            : "border border-border text-fg-muted"
        }`}
      >
        <Hourglass className="size-4" aria-hidden="true" />
        <span className="font-medium">{count === 0 ? "—" : count}</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="surface-raised absolute right-0 top-12 z-50 w-[min(34rem,calc(100vw-2rem))] rounded-xl border border-border shadow-elev-2"
        >
          <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-fg-muted">
              Waiting to enter
            </p>
            <p className="text-sm font-semibold tabular-nums">
              {count === 0 ? "—" : count}
            </p>
          </div>

          {count === 0 ? (
            <p className="px-4 py-6 text-center text-sm leading-relaxed text-fg-muted">
              Nothing lined up. The bot is watching{" "}
              {markets.length || "no"} market
              {markets.length === 1 ? "" : "s"} — Markets shows what it sees on
              each one.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto">
              {waiting.map((market) => (
                <li key={market.symbol}>
                  <Link
                    href={`/app/admin/chart?symbol=${encodeURIComponent(market.symbol)}`}
                    onClick={() => setOpen(false)}
                    role="menuitem"
                    className="block px-4 py-3 transition-colors hover:bg-surface-hover"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-medium">
                        {market.alias || market.symbol}
                      </span>
                      {/* The level it is waiting at, which is the one number
                          that makes a pending setup actionable. */}
                      <span className="shrink-0 font-mono text-xs text-brand">
                        {formatPrice(market.level)}
                      </span>
                    </span>
                    {/* IN FULL, wrapped. Victor: "the column still have more
                        to display but the space is small, expand the width so
                        everything will display boldly." `reason` is the bot's
                        whole structure reading — regime, swings, both levels
                        and why it has not entered — and every one of those is
                        the reason somebody opened this menu. A 34rem panel
                        fits it in three lines; the old 20rem one stopped at
                        "sup…", which is the half that says nothing.

                        No line clamp. An earlier version clamped at two and
                        the clamp did not apply, so the code said one thing and
                        the screen did another — and the screen was right. */}
                    <span
                      className="mt-1 block text-[11px] leading-relaxed text-fg-muted"
                      title={market.reason ?? undefined}
                    >
                      {market.strategy ? (
                        <span className="font-medium text-fg">
                          {market.strategy}
                        </span>
                      ) : null}
                      {market.strategy ? " · " : ""}
                      {market.reason ?? "ready"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <Link
            href="/app/admin/markets"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-1.5 border-t border-border px-4 py-3 text-sm font-medium text-accent transition-colors hover:bg-surface-hover"
          >
            All markets
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
