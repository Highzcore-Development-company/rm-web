import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/admin";
import { createRmServerClient } from "@/lib/supabase/rm-server";
import { getMarketBreakdown } from "@/lib/admin/history";
import { isRangeKey, RANGE_LABELS, type RangeKey } from "@/lib/admin/ranges";
import { RangePicker } from "@/components/admin/range-picker";
import { MarketsTable, type MarketRow } from "@/components/admin/markets-table";
import {
  pipValueFor,
  BROKER_MINIMUM_LOTS,
  type Quotes,
} from "@/lib/admin/pip-value";
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
 * table of thirty confirm dialogs is how the wrong market gets changed. This
 * page is the index and the scoreboard, and the chart is one click from every
 * row.
 *
 * Sorting and filtering live in <MarketsTable>, in the browser — see the note
 * there for why this page sorts differently from History.
 */
export default async function AdminMarketsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  if (!(await requirePermission("bot.view"))) notFound();

  const params = await searchParams;
  // TODAY by default, for the same reason as History. "All time" answered a
  // different question — how has this market done ever — when the one being
  // asked on open is what it is doing now.
  const range: RangeKey = isRangeKey(params.range) ? params.range : "today";

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
          .select("*")
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

  /**
   * Live prices, for the pip value.
   *
   * Keyed on the plain six letters, because pricing a yen pip means finding
   * USDJPY while the row is stored as USDJPY+. Built from the state rows that
   * were already fetched, so it costs no extra read — and it replaced a
   * hand-measured table that had drifted 15.7% on EURAUD and carried no figure
   * at all for thirteen of the twenty-eight markets.
   */
  const quotes: Quotes = {};
  for (const row of states) {
    const pair = (row.alias || row.symbol).toUpperCase().replace(/[^A-Z]/g, "");
    if (pair.length >= 6 && row.price) quotes[pair.slice(0, 6)] = row.price;
  }

  // Config is the roster — it is the list the bot actually trades from. A
  // market with live state but no config row is still shown (it would
  // otherwise be invisible), so the two are merged rather than one trusted.
  const symbols = [
    ...new Set([...configs.map((c) => c.symbol), ...states.map((s) => s.symbol)]),
  ];

  const rows: MarketRow[] = symbols.map((symbol) => {
    const config = configs.find((c) => c.symbol === symbol) ?? null;
    const state = stateBySymbol.get(symbol) ?? null;
    const perf = perfBySymbol.get(symbol) ?? null;

    // Blank lot size is NOT an absent setting, it is the broker minimum — the
    // common case, since most markets have never had one set. The pip figure
    // follows whatever size is actually in force, which is what Victor meant
    // by "per pips based on the selected lot size".
    const lots = config?.lot_size ?? BROKER_MINIMUM_LOTS;
    const pip = pipValueFor(symbol, lots, quotes);

    return {
      symbol,
      alias: config?.alias || state?.alias || symbol,
      state: state?.state ?? null,
      reason: state?.reason ?? null,
      openPnl: state?.state === "active" ? (state?.pnl ?? null) : null,
      enabled: config?.enabled !== false,
      lots: config?.lot_size ?? null,
      pipUsd: pip.kind === "known" ? pip.usd : null,
      closeAtProfit: config?.close_at_profit ?? null,
      updatedAt: state?.updated_at ?? null,
      net: perf?.net ?? null,
      trades: perf?.trades ?? null,
      wins: perf?.wins ?? null,
      losses: perf?.losses ?? null,
      winRate: perf?.winRate ?? null,
      profitFactor: perf?.profitFactor ?? null,
    };
  });

  const enabled = rows.filter((r) => r.enabled).length;
  const live = rows.filter((r) => r.state === "active").length;
  const pending = rows.filter((r) => r.state === "ready").length;

  return (
    <Shell range={range}>
      {/* THE SUMMARY, as figures rather than a sentence.
          Victor: "design this text well". It read
          "28 configured · 28 enabled · 4 pending · results for all time" —
          four different kinds of thing in one grey run-on line, where the
          counts that matter carried exactly as much weight as the word
          "results". Each number is a figure with its label under it now, and
          the range is a caption, which is what it always was. */}
      <dl className="mb-6 flex flex-wrap items-stretch gap-2">
        <Chip label="Markets" value={String(rows.length)} />
        <Chip
          label="Enabled"
          value={String(enabled)}
          hint={enabled < rows.length ? `${rows.length - enabled} off` : undefined}
        />
        <Chip label="Live" value={String(live)} tone={live > 0 ? "accent" : undefined} />
        <Chip
          label="Pending"
          value={String(pending)}
          tone={pending > 0 ? "brand" : undefined}
        />
        <p className="ml-auto flex items-end pb-1 text-xs text-fg-muted">
          Results for {RANGE_LABELS[range].toLowerCase()}
          {breakdown.truncated ? " · most recent 20,000 trades" : ""}
        </p>
      </dl>

      <MarketsTable rows={rows} liveInitial={states} />
    </Shell>
  );
}

function Chip({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "accent" | "brand";
}) {
  return (
    <div
      className={`surface rounded-lg border px-3.5 py-2 ${
        tone === "accent"
          ? "border-accent/40"
          : tone === "brand"
            ? "border-brand/40"
            : "border-border"
      }`}
    >
      <dd
        className={`text-lg font-semibold leading-none tabular-nums ${
          tone === "accent" ? "text-accent" : tone === "brand" ? "text-brand" : ""
        }`}
      >
        {value}
      </dd>
      <dt className="mt-1 text-[11px] uppercase tracking-wide text-fg-muted">
        {label}
        {hint ? <span className="ml-1 normal-case opacity-70">· {hint}</span> : null}
      </dt>
    </div>
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
      {/* No visible page title — see the note on the overview page. The h1
          stays screen-reader-only so the document still has a landmark. */}
      <h1 className="sr-only">Markets</h1>

      <div className="mb-6 flex flex-wrap items-end justify-end gap-4">
        <RangePicker current={range} basePath="/app/admin/markets" />
      </div>
      {children}
    </div>
  );
}
