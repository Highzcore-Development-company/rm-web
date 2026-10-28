"use client";

import Link from "next/link";
import { Activity, ArrowUpRight } from "lucide-react";
import { useLiveMarkets } from "@/components/workspace/use-live-markets";
import { useDismissable } from "@/components/admin/shell/use-dismissable";
import type { BotMarket } from "@/lib/workspace/types";

/**
 * What the bot has open right now, in the navbar.
 *
 * Victor: "live market will be at the navbar as a notification on how much we
 * have going on, then we will dropdown for us to see how much is going on, if
 * we click it will take us to the trading chart."
 *
 * "HOW MUCH IS GOING ON" IS MONEY, not a count. The badge is floating P&L,
 * because three open positions tells an admin nothing about whether to look —
 * three positions down $40 and three up $4 are the same badge otherwise. The
 * count is there too, smaller.
 *
 * LIVE, through the same realtime subscription the desk uses. A navbar figure
 * that froze at page load is worse than no figure: it is the one number on the
 * screen somebody would act on without refreshing first.
 *
 * It is NOT the only subscriber, and assuming it was broke /app/admin/bot:
 * that page renders the whole <Desk>, which wants the same feed, and two
 * components reaching for one Supabase channel throws. useLiveMarkets now
 * reference-counts a single subscription, so any number of mounts share one
 * socket — see the note there. The chart page still renders <MarketChart>
 * directly rather than the whole desk, but that is now an economy rather than
 * a load-bearing assumption.
 */
export function LiveBell({ initial }: { initial: BotMarket[] }) {
  const markets = useLiveMarkets(initial);
  const { open, setOpen, ref: container, hoverProps } = useDismissable();

  const live = markets.filter((m) => m.state === "active");
  const floating = live.reduce((sum, m) => sum + (m.pnl ?? 0), 0);

  // Only meaningful once something is open. With nothing open the figure is
  // $0.00, which would read as "flat and losing nothing" rather than "flat".
  const hasPositions = live.length > 0;
  const tone =
    !hasPositions
      ? "border border-border text-fg-muted"
      : floating > 0
        ? "border border-chart-up/40 text-chart-up"
        : floating < 0
          ? "border border-chart-down/40 text-chart-down"
          : "border border-border text-fg-muted";

  return (
    <div className="relative" ref={container} {...hoverProps}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={
          hasPositions
            ? `${live.length} open ${live.length === 1 ? "position" : "positions"}, ${money(floating)} floating`
            : "No open positions"
        }
        className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm tabular-nums transition-colors hover:bg-surface ${tone}`}
      >
        <span className="relative flex items-center">
          <Activity className="size-4" aria-hidden="true" />
          {hasPositions ? (
            // The dot says "something is live" at a glance, before the figure
            // is read. Animated, because a static dot reads as decoration.
            <span className="absolute -right-1 -top-1 flex size-2">
              <span className="absolute inline-flex size-2 animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-accent" />
            </span>
          ) : null}
        </span>
        {/* "Flat" is hidden on a phone, the P&L is never hidden.
            The header ran out of room and started overlapping the logo;
            the word that means "nothing is happening" is the cheapest thing
            to drop, and the dim icon already says it. A live figure is the
            whole reason this control exists, so it always shows. */}
        <span className={`font-medium ${hasPositions ? "" : "hidden sm:inline"}`}>
          {hasPositions ? money(floating) : "Flat"}
        </span>
        {hasPositions ? (
          <span className="text-[11px] text-fg-subtle">{live.length}</span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          /* PINNED TO THE VIEWPORT ON A PHONE, to the bell from sm up.
             `absolute right-0` aligns this panel's right edge with the
             BELL, and the bell sits left of the theme toggle and the
             avatar. At nearly 100vw wide that pushed the left edge off the
             screen, so the panel clipped its own text and every line began
             mid-word. Anchoring to the viewport gives it equal margins and
             nothing to hang off. */
          className="surface-raised fixed inset-x-3 top-16 z-50 rounded-xl border border-border shadow-elev-2 sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[min(30rem,calc(100vw-2rem))]"
        >
          <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-fg-muted">
              Open now
            </p>
            <p
              className={`text-sm font-semibold tabular-nums ${
                floating > 0
                  ? "text-chart-up"
                  : floating < 0
                    ? "text-chart-down"
                    : ""
              }`}
            >
              {hasPositions ? money(floating) : "—"}
            </p>
          </div>

          {!hasPositions ? (
            <p className="px-4 py-6 text-center text-sm text-fg-muted">
              Nothing open. The bot is watching{" "}
              {markets.length || "no"} market
              {markets.length === 1 ? "" : "s"}.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto">
              {live
                // Worst first: the position that needs looking at is the one
                // losing money, and it must not be below the fold.
                .slice()
                .sort((a, b) => (a.pnl ?? 0) - (b.pnl ?? 0))
                .map((market) => (
                  <li key={market.symbol}>
                    <Link
                      href={`/app/admin/chart?symbol=${encodeURIComponent(market.symbol)}`}
                      onClick={() => setOpen(false)}
                      role="menuitem"
                      className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-hover"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {market.alias || market.symbol}
                        </span>
                        <span className="block text-[11px] text-fg-subtle">
                          {market.volume ? `${market.volume} lots` : "—"}
                          {market.opened_at
                            ? ` · ${heldFor(market.opened_at)}`
                            : ""}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 text-sm font-semibold tabular-nums ${
                          (market.pnl ?? 0) > 0
                            ? "text-chart-up"
                            : (market.pnl ?? 0) < 0
                              ? "text-chart-down"
                              : "text-fg-muted"
                        }`}
                      >
                        {market.pnl === null ? "—" : money(market.pnl)}
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          )}

          <Link
            href="/app/admin/chart"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-1.5 border-t border-border px-4 py-3 text-sm font-medium text-accent transition-colors hover:bg-surface-hover"
          >
            Open the chart
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/** Signed, always. "$4.20" and "−$4.20" must never be one keystroke apart. */
function money(value: number): string {
  const sign = value < 0 ? "−" : value > 0 ? "+" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

/** Rough, and rough is right: "2h 14m" is the answer, not the exact second. */
function heldFor(openedAt: string): string {
  const minutes = Math.max(
    Math.round((Date.now() - new Date(openedAt).getTime()) / 60_000),
    0,
  );
  if (!Number.isFinite(minutes)) return "—";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
