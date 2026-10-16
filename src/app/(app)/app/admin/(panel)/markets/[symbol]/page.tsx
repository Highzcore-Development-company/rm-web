import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CandlestickChart } from "lucide-react";
import { getAdmin, requirePermission } from "@/lib/admin";
import { createRmServerClient } from "@/lib/supabase/rm-server";
import {
  canWriteToBot,
  writeBlockedReason,
} from "@/lib/supabase/rm-server-session";
import { MarketSettings } from "@/components/admin/market-settings";
import { Signed } from "@/components/admin/signed";
import { breakdownOf, decorate, totalsFor } from "@/lib/admin/history";
import {
  pipValueFor,
  BROKER_MINIMUM_LOTS,
  type Quotes,
} from "@/lib/admin/pip-value";
import type { BotConfig, BotEquity, BotMarket, BotTrade } from "@/lib/workspace/types";

export const metadata: Metadata = { title: "Market", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * One market: what it is doing, what it has done, and its settings.
 *
 * Victor: "click each market to view it's logs, settings, we can turn off the
 * market, set % profit or set fix amount profit target. and also view how much
 * $ we will make per lot size per pips."
 *
 * THE LOG IS THE TRADES. rm-server keeps no per-market event history — there
 * is one live state row per market, overwritten every cycle — so the honest
 * log is the market's closed trades plus whatever the live row currently says.
 * Inventing a log from the one row we have would be a list with a single
 * entry pretending to be a history.
 */
export default async function AdminMarketPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  if (!(await requirePermission("bot.view"))) notFound();

  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw);

  const client = createRmServerClient();
  if (!client) notFound();

  const admin = await getAdmin();
  // Permission, and whether the deployment can write at all. No second login:
  // "As long as you are an admin, I should be able to change the settings...
  // I don't need extra logins to do that."
  const canConfigure = admin?.permissions.includes("bot.configure") ?? false;
  const configurable = canConfigure && canWriteToBot();
  // Permission first: it is the one an admin cannot resolve themselves.
  const blocked = !canConfigure ? "no_permission" : writeBlockedReason();

  const [config, state, trades, snapshot, priceRows] = await Promise.all([
    client
      .from("bot_symbol_config")
      .select("symbol, alias, lot_size, close_at_profit, enabled, updated_at")
      .eq("symbol", symbol)
      .maybeSingle()
      .then((r) => (r.data ?? null) as BotConfig | null, () => null),
    client
      .from("bot_market_state")
      .select("*")
      .eq("symbol", symbol)
      .maybeSingle()
      .then((r) => (r.data ?? null) as BotMarket | null, () => null),
    client
      .from("bot_trades")
      .select(
        "id, ticket, symbol, side, volume, open_ts, open_price, close_ts, close_price, sl, tp, pnl, commission, swap, close_reason, strategy, r_multiple, trend_agreement",
      )
      .eq("symbol", symbol)
      .not("close_ts", "is", null)
      .order("close_ts", { ascending: false })
      .limit(100)
      .then((r) => (r.data ?? []) as BotTrade[], () => [] as BotTrade[]),
    client
      .from("bot_equity_snapshots")
      .select("balance, equity, ts")
      .order("ts", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((r) => (r.data ?? null) as BotEquity | null, () => null),
    client
      .from("bot_market_state")
      .select("symbol, alias, price")
      .then((r) => (r.data ?? []) as BotMarket[], () => [] as BotMarket[]),
  ]);

  // A market nobody has configured and that has never traded does not exist.
  if (!config && !state && trades.length === 0) notFound();

  const alias = config?.alias || state?.alias || symbol;
  const totals = totalsFor(trades);
  const perf = breakdownOf(trades)[0] ?? null;
  const rows = trades.map(decorate);

  const lots = config?.lot_size ?? BROKER_MINIMUM_LOTS;
  // The pip is paid in the quote currency, so pricing it in dollars needs the
  // OTHER pairs' prices — USDJPY to value a yen pip, and so on. One small read
  // of every market's price rather than a table that goes stale.
  const quotes: Quotes = {};
  for (const row of priceRows) {
    const pair = (row.alias || row.symbol).toUpperCase().replace(/[^A-Z]/g, "");
    if (pair.length >= 6 && row.price) quotes[pair.slice(0, 6)] = row.price;
  }
  const pip = pipValueFor(symbol, lots, quotes);
  const money = (n: number) => `$${Math.abs(n).toFixed(2)}`;

  return (
    <div>
      <Link
        href="/app/admin/markets"
        className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        All markets
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="display text-2xl font-semibold sm:text-3xl">{alias}</h1>
          <p className="mt-1 font-mono text-xs text-fg-subtle">{symbol}</p>
        </div>

        <div className="flex items-center gap-2">
          {/* The same tag the markets table carries, so the two pages answer
              "what is this market doing" in the same word. */}
          {state?.state === "active" ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent">
              <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
              Live
            </span>
          ) : state?.state === "ready" ? (
            <span className="rounded-lg border border-brand/40 bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand">
              Pending
            </span>
          ) : null}
          {config?.enabled === false ? (
            <span className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent">
              Turned off
            </span>
          ) : null}
          {/* Victor: "On the market specify a place for me to click that will
              take me to see the chart." */}
          <Link
            href={`/app/admin/chart?symbol=${encodeURIComponent(symbol)}`}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot"
          >
            <CandlestickChart className="size-4" aria-hidden="true" />
            View chart
          </Link>
        </div>
      </div>

      {/* ---- what it is doing right now ---- */}
      <section className="mt-8">
        <h2 className="text-sm font-medium">Right now</h2>
        {!state ? (
          <p className="mt-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
            No live state for this market. The bot has not written a row for it.
          </p>
        ) : (
          <dl className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Cell label="State" value={state.state ?? "—"} />
            {/* Spans the row and wraps: this is the one place the full
                structure reading belongs, and it is prose, not a figure. */}
            <Cell label="Reading" value={state.reason ?? "—"} wide />
            <Cell
              label="Price"
              value={state.price === null ? "—" : state.price.toString()}
            />
            <Cell
              label="Open P&L"
              value={
                state.state === "active" && state.pnl !== null ? (
                  <Signed value={state.pnl} format={money} />
                ) : (
                  "Flat"
                )
              }
            />
            <Cell label="Strategy" value={state.strategy ?? "—"} />
            <Cell label="H1 trend" value={state.htf_trend ?? "—"} />
            <Cell label="M15 trend" value={state.entry_trend ?? "—"} />
            <Cell
              label="Last write"
              value={
                state.updated_at
                  ? new Date(state.updated_at).toLocaleString("en-GB")
                  : "—"
              }
            />
          </dl>
        )}
      </section>

      {/* ---- what it has made ---- */}
      <section className="mt-10">
        <h2 className="text-sm font-medium">Performance</h2>
        <p className="mt-1 text-xs text-fg-muted">
          The most recent {trades.length} closed trade
          {trades.length === 1 ? "" : "s"} on this market, net of commission and
          swap.
        </p>
        {trades.length === 0 ? (
          <p className="mt-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
            Nothing has closed on this market yet.
          </p>
        ) : (
          <dl className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Cell label="Net" value={<Signed value={totals.net} format={money} />} />
            <Cell
              label="Trades"
              value={`${totals.trades} · ${totals.wins}W / ${totals.losses}L`}
            />
            <Cell
              label="Win rate"
              value={
                perf?.winRate === null || perf === null
                  ? "—"
                  : `${(perf.winRate * 100).toFixed(1)}%`
              }
            />
            <Cell
              label="Profit factor"
              value={
                totals.profitFactor === null
                  ? "No losses yet"
                  : totals.profitFactor.toFixed(2)
              }
            />
            <Cell
              label="Best trade"
              value={perf ? <Signed value={perf.best} format={money} /> : "—"}
            />
            <Cell
              label="Worst trade"
              value={perf ? <Signed value={perf.worst} format={money} /> : "—"}
            />
            <Cell
              label="Per pip"
              value={
                pip.kind === "known"
                  ? `$${pip.usd < 0.1 ? pip.usd.toFixed(3) : pip.usd.toFixed(2)} at ${lots} lots`
                  : "No quote yet"
              }
            />
            <Cell
              label="Set by"
              value={
                config?.updated_at
                  ? new Date(config.updated_at).toLocaleDateString("en-GB")
                  : "Never changed"
              }
            />
          </dl>
        )}
      </section>

      {/* ---- settings ---- */}
      <section className="mt-10">
        <h2 className="text-sm font-medium">Settings</h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-fg-muted">
          These write to rm-server as you, and the bot picks them up within
          about a minute. Each change is confirmed and recorded.
        </p>
        <div className="surface mt-3 rounded-xl border border-border p-5">
          <MarketSettings
            symbol={symbol}
            alias={alias}
            lotSize={config?.lot_size ?? null}
            closeAtProfit={config?.close_at_profit ?? null}
            enabled={config?.enabled ?? true}
            configurable={configurable}
            blocked={blocked}
            quotes={quotes}
            balance={snapshot?.balance ?? null}
          />
        </div>
      </section>

      {/* ---- the log ---- */}
      <section className="mt-10">
        <h2 className="text-sm font-medium">Trade log</h2>
        <p className="mt-1 text-xs text-fg-muted">
          Every closed trade on this market, newest first.
        </p>

        {rows.length === 0 ? (
          <p className="mt-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
            Nothing to log yet.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
                  <th scope="col" className="py-2 pr-4 font-medium">Closed</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Side</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Lots</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">In</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Out</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Held</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">R</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Why</th>
                  <th scope="col" className="py-2 text-right font-medium">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="py-2.5 pr-4 tabular-nums text-fg-muted">
                      {row.close_ts
                        ? new Date(row.close_ts).toLocaleString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="py-2.5 pr-4 uppercase">{row.side}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      {row.volume}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-fg-muted">
                      {row.open_price}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-fg-muted">
                      {row.close_price ?? "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-fg-muted">
                      {row.heldMinutes === null ? "—" : held(row.heldMinutes)}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-fg-muted">
                      {row.r_multiple === null ? "—" : row.r_multiple.toFixed(2)}
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-fg-muted">
                      {row.close_reason ?? "—"}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      <Signed value={row.net} format={money} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Cell({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: React.ReactNode;
  /** Prose rather than a figure: spans the grid and drops tabular-nums. */
  wide?: boolean;
}) {
  return (
    <div
      className={`surface rounded-xl border border-border p-4 ${
        wide ? "sm:col-span-2 xl:col-span-3" : ""
      }`}
    >
      <dt className="text-xs uppercase tracking-wide text-fg-muted">{label}</dt>
      <dd
        className={`mt-1.5 text-sm font-medium ${
          wide ? "leading-relaxed" : "tabular-nums"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function held(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
