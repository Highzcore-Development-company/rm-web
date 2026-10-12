"use client";

import { useState } from "react";
import { ChevronRight, Settings2 } from "lucide-react";
import type { BotMarket } from "@/lib/workspace/types";

/**
 * HS-BOT-v4 §2 — Market: every market and what the bot thinks of it.
 *
 * The investor's version of "is anything happening". Not a chart and not a
 * trade list: the bot's own read on each of the 30 instruments, which is the
 * thing an investor is paying for and otherwise never sees.
 *
 * An admin gets one extra affordance — opening a market to set its controls.
 * Same list, not a second screen, because the admin's question ("what is this
 * market doing, should I change it") starts from exactly the same row.
 */

/**
 * What the bot's state means, in words an investor can act on.
 *
 * The keys are the bot's real values — monitoring / ready / active. Anything
 * unrecognised falls through to the raw value rather than an em dash, so a
 * state the bot adds later still says something instead of looking broken.
 */
const STATE_LABEL: Record<string, string> = {
  active: "In a trade",
  ready: "Waiting for its level",
  monitoring: "Watching",
};

/** The bot already writes these as words — 'Uptrend', 'Sideways'. */
function trendOf(value: string | null | undefined): string {
  return value || "—";
}

export function MarketsPanel({
  markets,
  isAdmin,
  onConfigure,
}: {
  markets: BotMarket[];
  isAdmin: boolean;
  /** Opens this market's controls. Admin only; absent for an investor. */
  onConfigure?: (symbol: string) => void;
}) {
  const [query, setQuery] = useState("");

  const term = query.trim().toLowerCase();
  const shown = term
    ? markets.filter(
        (m) =>
          m.symbol.toLowerCase().includes(term) ||
          (m.alias ?? "").toLowerCase().includes(term),
      )
    : markets;

  // In a trade first, then waiting, then the rest. Thirty markets is too many
  // to read top to bottom, and the ones doing something are the ones worth
  // the top of the list.
  const ordered = [...shown].sort((a, b) => {
    const rank = (m: BotMarket) =>
      m.state === "active" ? 0 : m.state === "ready" ? 1 : 2;
    return rank(a) - rank(b) || a.symbol.localeCompare(b.symbol);
  });

  if (markets.length === 0) {
    return (
      <p className="px-3 py-4 text-sm text-fg-subtle">
        No markets yet. The bot publishes them as it loads.
      </p>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-2 pb-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a market"
          aria-label="Find a market"
          className="field-input w-full rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
        {ordered.map((m) => {
          const inTrade = m.state === "active";
          return (
            <li key={m.symbol}>
              <div className="flex items-start gap-2 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <span className="font-mono">{m.alias || m.symbol}</span>
                    {inTrade && (
                      <span className="rounded bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-brand-fg">
                        LIVE
                      </span>
                    )}
                  </p>

                  <p className="mt-1 text-xs text-fg-muted">
                    {STATE_LABEL[m.state ?? ""] ?? m.state ?? "—"}
                    {/* The bot's own reason, when it has one. This is the
                        sentence that answers "why is it not trading", which
                        is the question people actually ask. */}
                    {m.reason ? ` · ${m.reason}` : ""}
                  </p>

                  <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] tabular-nums text-fg-subtle">
                    <div className="flex gap-1">
                      <dt>Trend</dt>
                      <dd className="text-fg-muted">{trendOf(m.entry_trend)}</dd>
                    </div>
                    {m.htf && (
                      <div className="flex gap-1">
                        <dt>{m.htf}</dt>
                        <dd className="text-fg-muted">{trendOf(m.htf_trend)}</dd>
                      </div>
                    )}
                    {m.price != null && (
                      <div className="flex gap-1">
                        <dt>Price</dt>
                        <dd className="text-fg-muted">{m.price}</dd>
                      </div>
                    )}
                  </dl>

                  {m.latest_signal && (
                    <p className="mt-1.5 font-mono text-[11px] text-fg-muted">
                      {m.latest_signal}
                    </p>
                  )}
                </div>

                {isAdmin && onConfigure && (
                  <button
                    type="button"
                    onClick={() => onConfigure(m.symbol)}
                    aria-label={`Set controls for ${m.alias || m.symbol}`}
                    className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[11px] text-fg-muted transition-colors hover:text-fg"
                  >
                    <Settings2 className="size-3.5" aria-hidden="true" />
                    Set
                    <ChevronRight className="size-3" aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
