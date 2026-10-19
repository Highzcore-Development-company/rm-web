"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { BotSnapshot } from "@/lib/workspace/types";

/**
 * The trade review — entry beside exit, on the dashboard.
 *
 * HS-BOT-ANALYSIS section 8 calls this blocking, and it is ours rather than
 * Victor's because the bot's side is already done: it publishes the whole
 * review to bot_trades, the History page loads every column with select("*"),
 * and nothing rendered it. Olivia has been reading this out of Telegram while
 * the same data sat unused in the page she was already looking at.
 *
 * The method it serves (section 3) is: form your read from the chart FIRST,
 * write the verdict, and only then open this. So it is COLLAPSED by default —
 * a panel that shows the bot's answer before it is asked turns a review into
 * agreement, which is exactly what that section warns about.
 *
 * ENTRY AND EXIT SIDE BY SIDE, because the question is almost never "what was
 * RSI". It is "was momentum still expanding when it entered, and what had it
 * done by the time it closed". One column cannot answer that.
 */

export type TradeReviewData = {
  entry: BotSnapshot | null;
  exit: BotSnapshot | null;
  entryTrend: number | null;
  entryHtfTrend: number | null;
  trendAgreement: string | null;
  mfe: number | null;
  mae: number | null;
  rMultiple: number | null;
  entrySpread: number | null;
  strategy: string | null;
  timeframe: string | null;
  htf?: string | null;
};

/** The bot stores trend as -2..+2. These are its own words for them. */
const TREND_WORDS: Record<number, string> = {
  [-2]: "Strong Down",
  [-1]: "Weak Down",
  0: "Sideways",
  1: "Weak Up",
  2: "Strong Up",
};

function trend(value: number | null): string {
  if (value === null) return "—";
  return TREND_WORDS[value] ?? String(value);
}

function num(value: number | null | undefined, dp = 2): string {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(dp);
}

/**
 * One indicator, entry against exit.
 *
 * `note` carries the threshold that makes the number mean something — ADX
 * below 20 is ranging, above 25 is trending — because a reader who has to
 * remember that is a reader who will not.
 */
function Row({
  label,
  entry,
  exit,
  dp = 2,
  note,
}: {
  label: string;
  entry: number | null | undefined;
  exit: number | null | undefined;
  dp?: number;
  note?: string;
}) {
  return (
    <tr className="border-b border-border/60 last:border-b-0">
      <th scope="row" className="py-1.5 pr-3 text-left font-normal text-fg-muted">
        {label}
        {note && <span className="ml-1.5 text-[10px] text-fg-subtle">{note}</span>}
      </th>
      <td className="py-1.5 pr-3 text-right tabular-nums">{num(entry, dp)}</td>
      <td className="py-1.5 text-right tabular-nums text-fg-muted">
        {num(exit, dp)}
      </td>
    </tr>
  );
}

export function TradeReview({ data }: { data: TradeReviewData }) {
  const [open, setOpen] = useState(false);

  // Nothing rather than an empty panel: trades that closed before the snapshot
  // shipped have none, and it is not backfillable.
  if (!data.entry) {
    return <span className="text-xs text-fg-subtle">No review</span>;
  }

  const e = data.entry;
  const x = data.exit;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs text-fg-muted transition-colors hover:text-fg"
      >
        {open ? (
          <ChevronDown className="size-3.5" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3.5" aria-hidden="true" />
        )}
        Review
      </button>

      {open && (
        <div className="mt-3 rounded-lg border border-border bg-surface p-4 text-left">
          {/* WHAT THIS FIELD ACTUALLY IS, until Victor aligns it.
              (Victor, 19 Oct) The gate reads trend on the last CLOSED bar;
              this snapshot is taken at FILL, on a frame that still holds the
              forming bar. Same function, different bar. So it is the reading
              at the moment of filling — NOT what the bot decided on, and it
              cannot prove the bot entered without a trend.

              Said on screen because the mislabel is actively misleading: it
              reads as "the bot entered with no trend", which is the wrong
              conclusion and nearly became a filed bug. Remove this note when
              the snapshot is aligned to the signal bar. */}
          <p className="mb-3 rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-[11px] leading-relaxed text-fg-muted">
            Trend below is read <strong className="text-fg">at the fill</strong>,
            not at the moment the bot decided. A reading of Sideways here does
            not mean it entered without a trend — the decision was made on the
            previous closed bar. Treat a disagreement as a possible late entry,
            not a broken rule.
          </p>

          <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-border pb-3 text-xs">
            <span>
              <span className="text-fg-muted">Trend at fill </span>
              <span className="font-medium">{trend(data.entryTrend)}</span>
              {data.htf ? (
                <span className="text-fg-muted">
                  {" "}
                  · {data.htf} {trend(data.entryHtfTrend)}
                </span>
              ) : null}
            </span>
            <span>
              <span className="text-fg-muted">Agreement at fill </span>
              <span className="font-medium">{data.trendAgreement ?? "—"}</span>
            </span>
            {data.strategy ? (
              <span className="text-fg-muted">
                {data.strategy} · {data.timeframe ?? "—"}
              </span>
            ) : null}
          </div>

          {/* MFE and MAE lead. "Was it ever winning, and by how much" is a
              different question from whether it closed green, and it is the
              one that catches a winner cut short. */}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-b border-border py-3 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-fg-muted">Best it got (MFE)</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{num(data.mfe)}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">Worst it got (MAE)</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{num(data.mae)}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">R multiple</dt>
              <dd className="mt-0.5 font-medium tabular-nums">
                {num(data.rMultiple)}
              </dd>
            </div>
            <div>
              <dt className="text-fg-muted">Spread at entry</dt>
              <dd className="mt-0.5 font-medium tabular-nums">
                {num(data.entrySpread, 5)}
              </dd>
            </div>
          </dl>

          <table className="mt-3 w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-fg-subtle">
                <th scope="col" className="pb-1.5 text-left font-medium">
                  Indicator
                </th>
                <th scope="col" className="pb-1.5 text-right font-medium">
                  At entry
                </th>
                <th scope="col" className="pb-1.5 text-right font-medium">
                  At exit
                </th>
              </tr>
            </thead>
            <tbody>
              <Row label="RSI 14" entry={e.rsi} exit={x?.rsi} dp={1} />
              <Row
                label="ADX"
                entry={e.adx}
                exit={x?.adx}
                dp={1}
                note="under 20 ranging, over 25 trending"
              />
              <Row label="+DI" entry={e.plus_di} exit={x?.plus_di} dp={1} />
              <Row label="−DI" entry={e.minus_di} exit={x?.minus_di} dp={1} />
              <Row label="MACD" entry={e.macd} exit={x?.macd} dp={5} />
              <Row
                label="MACD histogram"
                entry={e.macd_hist}
                exit={x?.macd_hist}
                dp={5}
                note="fading means momentum going"
              />
              <Row
                label="Bollinger z"
                entry={e.bb_z}
                exit={x?.bb_z}
                dp={2}
                note="how stretched price was"
              />
              <Row label="ATR 14" entry={e.atr} exit={x?.atr} dp={5} />
              <Row label="EMA 50" entry={e.ema50} exit={x?.ema50} dp={3} />
              <Row label="EMA 200" entry={e.ema200} exit={x?.ema200} dp={3} />
              <Row label="Close" entry={e.close} exit={x?.close} dp={3} />
            </tbody>
          </table>

          {!x ? (
            <p className="mt-3 text-[11px] text-fg-subtle">
              No exit snapshot — the trade is still open, or it closed before
              the bot recorded one.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
