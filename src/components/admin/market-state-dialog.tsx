"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CandlestickChart, X } from "lucide-react";
import { TimeAgo } from "@/components/workspace/bot-bits";
import { formatPrice } from "@/lib/price";
import type { BotMarket } from "@/lib/workspace/types";

/**
 * Everything the bot currently holds about one market.
 *
 * Victor: "when I click doings it should modal to show me in full what's going
 * on in the backend."
 *
 * The Doing column carries the bot's own reading, which runs to a sentence and
 * is truncated to keep the table a table. That sentence is only part of the
 * row, though — bot_market_state also carries both trends, the routed
 * strategy, the level it is watching, the broker's stop and target, and a
 * snapshot of every indicator as of the last closed bar. None of it was
 * reachable from the dashboard at all.
 *
 * THE INDICATOR SNAPSHOT IS THE POINT. "RANGE | flat | eff 0.05" is the bot's
 * conclusion; ADX 28.8, RSI 41, ATR 0.00067 is the evidence it reached it
 * from, and the only way to tell a correct read from a lucky one.
 *
 * NULL IS RENDERED AS "—", NEVER AS ZERO. Every indicator can legitimately be
 * null — the terminal may not have had the history to compute it — and a zero
 * ADX means "no trend at all" rather than "not measured", which is a different
 * and much more confident claim.
 */
export function MarketStateDialog({
  market,
  onClose,
}: {
  market: BotMarket;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const snap = market.snapshot;
  const alias = market.alias || market.symbol;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 cursor-default bg-black/60"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="state-title"
        className="surface-raised relative z-10 w-full max-w-3xl rounded-xl border border-border shadow-elev-2"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id="state-title" className="text-base font-semibold">
              {alias}
              <span className="ml-2 font-mono text-xs font-normal text-fg-subtle">
                {market.symbol}
              </span>
            </h2>
            {/* THE CLOCK, first. "I need to know when it updated last so I know
                the server is active in real time update." */}
            <p className="mt-1 text-xs text-fg-muted">
              Written <TimeAgo iso={market.updated_at} />
              {market.updated_at
                ? ` · ${new Date(market.updated_at).toLocaleTimeString("en-GB")}`
                : ""}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={`/app/admin/chart?symbol=${encodeURIComponent(market.symbol)}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-fg-muted transition-colors hover:border-accent/40 hover:text-fg"
            >
              <CandlestickChart className="size-3.5" aria-hidden="true" />
              Chart
            </Link>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-fg-muted transition-colors hover:text-fg"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-5">
          {/* The reading, in full and unwrapped — this is the thing the table
              had to truncate. */}
          <section>
            <h3 className="text-xs uppercase tracking-wide text-fg-muted">
              What it is doing
            </h3>
            <p className="mt-2 text-sm leading-relaxed">
              {market.reason ?? "No reading recorded."}
            </p>
          </section>

          <section className="mt-5">
            <h3 className="text-xs uppercase tracking-wide text-fg-muted">
              Decision
            </h3>
            <dl className="mt-2 grid gap-3 sm:grid-cols-3">
              <Cell label="State" value={market.state ?? "—"} />
              <Cell label="Strategy" value={market.strategy ?? "watching"} />
              <Cell
                label="Watching"
                value={formatPrice(market.level)}
              />
              {/* The second rung up, FIRST — an analyst reads top-down, and
                  this is the chart they start on. Only rendered once the bot
                  publishes it (its migration 020); an older row would show a
                  dash that looks like "no trend" rather than "not recorded". */}
              {market.htf2_trend ? (
                <Cell
                  label={`${market.htf2 ?? "H4"} trend`}
                  value={market.htf2_trend}
                />
              ) : null}
              <Cell label={`${market.htf ?? "H1"} trend`} value={market.htf_trend ?? "—"} />
              <Cell
                label={`${market.timeframe ?? "M15"} trend`}
                value={market.entry_trend ?? "—"}
              />
              <Cell label="Signal" value={market.latest_signal ?? "—"} />
            </dl>
          </section>

          <section className="mt-5">
            <h3 className="text-xs uppercase tracking-wide text-fg-muted">
              At the broker
            </h3>
            <dl className="mt-2 grid gap-3 sm:grid-cols-3">
              <Cell
                label="Price"
                value={market.price === null ? "—" : String(market.price)}
              />
              <Cell
                label="Open P&L"
                value={
                  market.state === "active" && market.pnl !== null
                    ? `${market.pnl >= 0 ? "+" : "−"}$${Math.abs(market.pnl).toFixed(2)}`
                    : "Flat"
                }
                tone={
                  market.state === "active" && market.pnl !== null
                    ? market.pnl >= 0
                      ? "up"
                      : "down"
                    : undefined
                }
              />
              <Cell
                label="Lots"
                value={market.volume === null ? "—" : String(market.volume)}
              />
              <Cell label="Stop" value={market.sl === null ? "—" : String(market.sl)} />
              <Cell label="Target" value={market.tp === null ? "—" : String(market.tp)} />
              <Cell
                label="Opened"
                value={
                  market.opened_at
                    ? new Date(market.opened_at).toLocaleString("en-GB")
                    : "—"
                }
              />
            </dl>
          </section>

          <section className="mt-5">
            <h3 className="text-xs uppercase tracking-wide text-fg-muted">
              Indicators
            </h3>
            {!snap ? (
              <p className="mt-2 rounded-lg border border-border bg-surface px-4 py-3 text-xs leading-relaxed text-fg-muted">
                No snapshot on this row. The bot writes one per publish from
                migration 012 onwards — an older row simply has none, and it
                cannot be backfilled.
              </p>
            ) : (
              <>
                <p className="mt-1 text-[11px] text-fg-subtle">
                  As of the last closed bar
                  {snap.time
                    ? `, ${new Date(snap.time).toLocaleString("en-GB")}`
                    : ""}
                  . A dash means the terminal lacked the history to compute it —
                  not zero.
                </p>
                <dl className="mt-2 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  <Cell label="Close" value={num(snap.close, 5)} />
                  <Cell label="Trend" value={num(snap.trend, 0)} />
                  <Cell label="ADX" value={num(snap.adx, 1)} />
                  <Cell label="ATR" value={num(snap.atr, 5)} />
                  <Cell label="RSI" value={num(snap.rsi, 1)} />
                  <Cell label="EMA 50" value={num(snap.ema50, 5)} />
                  <Cell label="EMA 200" value={num(snap.ema200, 5)} />
                  <Cell label="MACD" value={num(snap.macd, 5)} />
                  <Cell label="MACD hist" value={num(snap.macd_hist, 5)} />
                  <Cell label="+DI" value={num(snap.plus_di, 1)} />
                  <Cell label="−DI" value={num(snap.minus_di, 1)} />
                  <Cell label="BB z" value={num(snap.bb_z, 2)} />
                </dl>
              </>
            )}
          </section>

          {market.is_dry_run ? (
            <p className="mt-5 rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 text-xs">
              <strong className="font-medium">Dry run.</strong> This market is
              not placing real orders.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="surface rounded-lg border border-border px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-fg-muted">
        {label}
      </dt>
      <dd
        className={`mt-0.5 break-all text-sm font-medium tabular-nums ${
          tone === "up" ? "text-chart-up" : tone === "down" ? "text-chart-down" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

/** Null is a dash, never a zero — see the note at the top. */
function num(value: number | null | undefined, places: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toFixed(places);
}
