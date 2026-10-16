import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CandlestickChart, ChevronRight } from "lucide-react";
import { requirePermission } from "@/lib/admin";
import { createRmServerClient } from "@/lib/supabase/rm-server";
import { getMarketBreakdown, type MarketPerformance } from "@/lib/admin/history";
import { isRangeKey, RANGE_LABELS, type RangeKey } from "@/lib/admin/ranges";
import { RangePicker } from "@/components/admin/range-picker";
import { Signed } from "@/components/admin/signed";
import { pipValueFor, formatPipValue, BROKER_MINIMUM_LOTS } from "@/lib/admin/pip-value";
import type { BotConfig, BotMarket } from "@/lib/workspace/types";

export const metadata: Metadata = { title: "Markets", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Every market, what it is doing, and what it has made.
 *
 * Victor: "the markets where we can click each market to view it's logs,
 * settings, we can turn off the market, set % profit or set fix amount profit
 * target. and also view how much $ we will make per lot size per pips."
 *
 * The controls are on the market's own page rather than inline here. They move
 * real money and each needs a confirmation showing the old and new value; a
 * row of thirty confirm dialogs in a table is how the wrong market gets
 * changed. This page is the index and the scoreboard, and the chart is one
 * click from every row.
 *
 * ORDERED WORST FIRST, from getMarketBreakdown. An admin opens this to find
 * what is losing money.
 */
export default async function AdminMarketsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  if (!(await requirePermission("bot.view"))) notFound();

  const params = await searchParams;
  const range: RangeKey = isRangeKey(params.range) ? params.range : "all";

  const client = createRmServerClient();

  const [configs, states, breakdown] = await Promise.all([
    client
      ? client
          .from("bot_symbol_config")
          .select("symbol, alias, lot_size, close_at_profit, enabled, updated_at")
          .then((r) => (r.data ?? []) as BotConfig[], () => [] as BotConfig[])
      : Promise.resolve([] as BotConfig[]),
    client
      ? client
          .from("bot_market_state")
          .select("symbol, alias, state, reason, htf_trend, pnl, price, updated_at")
          .then((r) => (r.data ?? []) as BotMarket[], () => [] as BotMarket[])
      : Promise.resolve([] as BotMarket[]),
    getMarketBreakdown(range, { from: params.from, to: params.to }),
  ]);

  if (!client) {
    return (
      <Shell range={range}>
        <p className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
          rm-server is not configured, so there are no markets to show.
        </p>
      </Shell>
    );
  }

  const stateBySymbol = new Map(states.map((s) => [s.symbol, s]));
  const perfBySymbol = new Map(breakdown.markets.map((m) => [m.symbol, m]));

  // Config is the roster — it is the list the bot actually trades from. A
  // market with live state but no config row is still shown (it would
  // otherwise be invisible), so the two are merged rather than one trusted.
  const symbols = [
    ...new Set([...configs.map((c) => c.symbol), ...states.map((s) => s.symbol)]),
  ];

  const rows = symbols.map((symbol) => ({
    symbol,
    config: configs.find((c) => c.symbol === symbol) ?? null,
    state: stateBySymbol.get(symbol) ?? null,
    perf: perfBySymbol.get(symbol) ?? null,
  }));

  // Worst first, markets with no result in this range last — they are not
  // "break even", they simply have nothing to say.
  rows.sort((a, b) => {
    const an = a.perf?.net;
    const bn = b.perf?.net;
    if (an === undefined && bn === undefined) return a.symbol.localeCompare(b.symbol);
    if (an === undefined) return 1;
    if (bn === undefined) return -1;
    return an - bn;
  });

  const enabled = rows.filter((r) => r.config?.enabled !== false).length;

  return (
    <Shell range={range}>
      <p className="mb-4 text-xs text-fg-muted">
        {rows.length} configured · {enabled} enabled · results for{" "}
        {RANGE_LABELS[range].toLowerCase()}
        {breakdown.truncated
          ? " · figures cover the most recent 20,000 trades"
          : ""}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
              <th scope="col" className="py-2 pr-4 font-medium">Market</th>
              <th scope="col" className="py-2 pr-4 font-medium">Doing</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Result</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Trades</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Win rate</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Lots</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Per pip</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Target</th>
              <th scope="col" className="py-2 pr-2 font-medium">Chart</th>
              <th scope="col" className="py-2 font-medium sr-only">Open</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <Row key={row.symbol} {...row} />
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
          No markets configured on rm-server yet.
        </p>
      ) : null}
    </Shell>
  );
}

function Shell({
  range,
  children,
}: {
  range: RangeKey;
  children: React.ReactNode;
}) {
  return (
    <div>
      {/* NO VISIBLE PAGE TITLE. Victor, 16 Oct: "remove all title from each
          pages, I don't like it... Keep it without any title." The sidebar
          already says which page this is, so the heading and its blurb were
          repeating it back.

          The h1 stays, screen-reader-only: a document with no h1 gives an
          assistive reader no landmark to jump to and no idea what it has
          landed on, and "invisible" is not the same as "absent". */}
      <h1 className="sr-only">Markets</h1>

      <div className="mb-6 flex flex-wrap items-end justify-end gap-4">
        <RangePicker current={range} basePath="/app/admin/markets" />
      </div>
      {children}
    </div>
  );
}

function Row({
  symbol,
  config,
  state,
  perf,
}: {
  symbol: string;
  config: BotConfig | null;
  state: BotMarket | null;
  perf: MarketPerformance | null;
}) {
  const money = (n: number) => `$${Math.abs(n).toFixed(2)}`;
  const href = `/app/admin/markets/${encodeURIComponent(symbol)}`;
  const alias = config?.alias || state?.alias || symbol;

  // Blank lot size is NOT an absent setting, it is the broker minimum — the
  // common case, since most markets have never had one set.
  const lots = config?.lot_size ?? BROKER_MINIMUM_LOTS;
  const pip = pipValueFor(symbol, lots);
  const off = config?.enabled === false;

  return (
    <tr className={off ? "opacity-55" : undefined}>
      <th scope="row" className="py-3 pr-4 font-normal">
        <Link href={href} className="font-medium hover:text-accent">
          {alias}
        </Link>
        {off ? (
          <span className="ml-2 rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-fg-muted">
            Off
          </span>
        ) : null}
        {alias !== symbol ? (
          <span className="block font-mono text-[11px] text-fg-subtle">
            {symbol}
          </span>
        ) : null}
      </th>

      <td className="py-3 pr-4">
        {state?.state === "active" ? (
          <span className="inline-flex items-center gap-1.5 text-accent">
            <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
            In a trade
            {state.pnl !== null ? (
              <span className="tabular-nums">
                ({state.pnl >= 0 ? "+" : "−"}${Math.abs(state.pnl).toFixed(2)})
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-xs text-fg-muted">
            {state?.reason ?? (state ? "Watching" : "No state")}
          </span>
        )}
      </td>

      <td className="py-3 pr-4 text-right tabular-nums">
        {perf ? <Signed value={perf.net} format={money} /> : <Dash />}
      </td>
      <td className="py-3 pr-4 text-right tabular-nums text-fg-muted">
        {perf ? perf.trades : <Dash />}
      </td>
      <td className="py-3 pr-4 text-right tabular-nums text-fg-muted">
        {perf?.winRate === null || perf === null ? (
          <Dash />
        ) : (
          `${(perf.winRate * 100).toFixed(0)}%`
        )}
      </td>
      <td className="py-3 pr-4 text-right tabular-nums">
        {config?.lot_size ?? (
          <span className="text-fg-muted">{BROKER_MINIMUM_LOTS} min</span>
        )}
      </td>
      <td className="py-3 pr-4 text-right tabular-nums text-fg-muted">
        {/* The figure Victor asked for, per row: what one pip is worth at the
            size this market is actually set to. */}
        {pip.kind === "known"
          ? `$${pip.usd < 0.1 ? pip.usd.toFixed(3) : pip.usd.toFixed(2)}`
          : formatPipValue(pip) || <Dash />}
      </td>
      <td className="py-3 pr-4 text-right tabular-nums text-fg-muted">
        {config?.close_at_profit ? `$${config.close_at_profit.toFixed(2)}` : <Dash />}
      </td>
      <td className="py-3 pr-2">
        <Link
          href={`/app/admin/chart?symbol=${encodeURIComponent(symbol)}`}
          className="inline-flex items-center gap-1 text-xs text-fg-muted transition-colors hover:text-accent"
          aria-label={`Open the chart for ${alias}`}
        >
          <CandlestickChart className="size-4" aria-hidden="true" />
          View
        </Link>
      </td>
      <td className="py-3">
        <Link
          href={href}
          className="inline-flex items-center text-fg-subtle transition-colors hover:text-accent"
          aria-label={`Open ${alias}`}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </td>
    </tr>
  );
}

function Dash() {
  return <span className="text-fg-subtle">—</span>;
}
