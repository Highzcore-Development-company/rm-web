import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/admin";
import { createRmServerClient } from "@/lib/supabase/rm-server";
import { MarketChart } from "@/components/workspace/market-chart";
import type { BotConfig, BotMarket, BotTrade } from "@/lib/workspace/types";

export const metadata: Metadata = { title: "Chart", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The candlestick chart.
 *
 * Victor: "another link still on the side bar will open the candle stick
 * chart."
 *
 * THE SAME <MarketChart> THE INVESTOR DESK USES, not a fork. The two must
 * agree about what price did, and a copy drifts the first time either is
 * touched. It is rendered directly rather than inside the whole <Desk>, which
 * also keeps the navbar's live bell the only subscriber to bot_market_state —
 * one socket open per admin page, whichever page it is.
 *
 * `?symbol=` is how the markets table and the bell link here, so "view the
 * chart for this market" lands on that market rather than on whichever one
 * sorts first.
 */
export default async function AdminChartPage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string }>;
}) {
  if (!(await requirePermission("bot.view"))) notFound();

  const { symbol } = await searchParams;
  const client = createRmServerClient();

  const [configs, states, openTrades] = await Promise.all([
    client
      ? client
          .from("bot_symbol_config")
          .select("symbol, alias")
          .then(
            (r) => (r.data ?? []) as Pick<BotConfig, "symbol" | "alias">[],
            () => [] as Pick<BotConfig, "symbol" | "alias">[],
          )
      : Promise.resolve([] as Pick<BotConfig, "symbol" | "alias">[]),
    client
      ? client
          .from("bot_market_state")
          .select("symbol, alias")
          .then((r) => (r.data ?? []) as BotMarket[], () => [] as BotMarket[])
      : Promise.resolve([] as BotMarket[]),
    client
      ? client
          .from("bot_trades")
          .select("symbol, side")
          .is("close_ts", null)
          .then((r) => (r.data ?? []) as BotTrade[], () => [] as BotTrade[])
      : Promise.resolve([] as BotTrade[]),
  ]);

  // Config is the roster, state fills in anything configured outside it. Both,
  // deduped, so a market that exists in one and not the other still appears in
  // the picker rather than being unreachable.
  const bySymbol = new Map<string, string>();
  for (const row of states) bySymbol.set(row.symbol, row.alias || row.symbol);
  for (const row of configs) bySymbol.set(row.symbol, row.alias || row.symbol);

  const markets = [...bySymbol.entries()]
    .map(([sym, alias]) => ({ symbol: sym, alias }))
    .sort((a, b) => a.alias.localeCompare(b.alias));

  // A symbol in the URL that the bot does not have would leave the chart
  // focused on nothing. Resolved against the real list, and ignored otherwise.
  const focus =
    symbol && bySymbol.has(symbol) ? symbol : (markets[0]?.symbol ?? null);

  if (!client || markets.length === 0) {
    return (
      <div>
        <h1 className="sr-only">Chart</h1>
        <p className="rounded-lg border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-fg-muted">
          {!client
            ? "rm-server is not configured, so there are no markets to chart."
            : "The bot has no markets configured yet."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-9rem)] min-h-[32rem] flex-col">
      {/* NO VISIBLE PAGE TITLE. Victor, 16 Oct: "remove all title from each
          pages, I don't like it... Keep it without any title." The sidebar
          already says which page this is, so the heading and its blurb were
          repeating it back.

          The h1 stays, screen-reader-only: a document with no h1 gives an
          assistive reader no landmark to jump to and no idea what it has
          landed on, and "invisible" is not the same as "absent". */}
      <h1 className="sr-only">Chart</h1>

      {/* Fills the rest of the viewport. The chart is the page here, so it gets
          the height rather than a fixed card inside a scrolling column. */}
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border">
        <MarketChart
          markets={markets}
          openTrades={openTrades.map((t) => ({ symbol: t.symbol, side: t.side }))}
          focusSymbol={focus}
          chrome="workspace"
          marketHrefBase="/app/admin/markets"
        />
      </div>
    </div>
  );
}
