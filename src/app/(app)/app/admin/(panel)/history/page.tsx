import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/admin";
import { createRmServerClient } from "@/lib/supabase/rm-server";
import {
  getHistory,
  getMarketBreakdown,
  type Outcome,
  type SortDir,
  type SortKey,
} from "@/lib/admin/history";
import { isRangeKey, RANGE_LABELS, type RangeKey } from "@/lib/admin/ranges";
import { RangePicker } from "@/components/admin/range-picker";
import { TradeReview } from "@/components/admin/trade-review";
import { Signed } from "@/components/admin/signed";
import {
  HistoryFilters,
  type FilterOption,
} from "@/components/admin/history-filters";
import { MarketBreakdownTable } from "@/components/admin/market-breakdown-table";
import type { BotConfig, BotTrade } from "@/lib/workspace/types";

export const metadata: Metadata = { title: "History", robots: { index: false } };
export const dynamic = "force-dynamic";

const SORTS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "symbol", label: "Market", align: "left" },
  { key: "opened", label: "Opened", align: "left" },
  { key: "closed", label: "Closed", align: "left" },
  { key: "duration", label: "Held", align: "right" },
  { key: "pnl", label: "Net", align: "right" },
];

function isSortKey(value: string | undefined): value is SortKey {
  return ["closed", "opened", "pnl", "symbol", "duration"].includes(value ?? "");
}

function isOutcome(value: string | undefined): value is Outcome {
  return ["won", "lost", "scratch"].includes(value ?? "");
}

type View = "markets" | "trades";

/**
 * History — everything that closed, over whatever range is asked for.
 *
 * EVERY CONTROL IS IN THE URL: the range, the view, the market, the side, the
 * outcome, the close reason, the sort and the page. Victor: "add them to the
 * route so I can refresh and it will still be there." So a view survives a
 * refresh, it can be sent to somebody, and the server reads it directly — which
 * is what keeps the figures above the table describing the same set the table
 * is showing.
 *
 * TWO VIEWS, not two stacked sections. By market answers "which markets are
 * working" and cannot be read off a page of trades; Trades answers "what
 * happened". They used to sit one above the other, so finding the trades meant
 * scrolling past twenty-eight markets every time.
 */
export default async function AdminHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    from?: string;
    to?: string;
    view?: string;
    symbol?: string;
    side?: string;
    outcome?: string;
    reason?: string;
    sort?: string;
    dir?: string;
    page?: string;
  }>;
}) {
  if (!(await requirePermission("bot.view"))) notFound();

  const params = await searchParams;
  // TODAY by default. Esther: opening History should land on today, not on a
  // week — somebody opening it has just watched something happen and wants to
  // see that, and a week of rows buries it. The range is in the URL, so a
  // wider view is one click and a shareable link away.
  const range: RangeKey = isRangeKey(params.range) ? params.range : "today";
  const view: View = params.view === "trades" ? "trades" : "markets";
  const sort: SortKey = isSortKey(params.sort) ? params.sort : "closed";
  const dir: SortDir = params.dir === "asc" ? "asc" : "desc";
  const page = Math.max(Number(params.page ?? 1) || 1, 1);
  const symbol = params.symbol?.trim() || null;
  const side = params.side === "buy" || params.side === "sell" ? params.side : null;
  const outcome: Outcome = isOutcome(params.outcome) ? params.outcome : "all";
  const reason = params.reason?.trim() || null;

  const client = createRmServerClient();

  const [history, breakdown, configs, reasonRows] = await Promise.all([
    getHistory({
      range,
      from: params.from,
      to: params.to,
      symbol,
      side,
      outcome,
      reason,
      sort,
      dir,
      page,
    }),
    getMarketBreakdown(range, { from: params.from, to: params.to }),
    client
      ? client
          .from("bot_symbol_config")
          .select("symbol, alias")
          .then(
            (r) => (r.data ?? []) as Pick<BotConfig, "symbol" | "alias">[],
            () => [] as Pick<BotConfig, "symbol" | "alias">[],
          )
      : Promise.resolve([] as Pick<BotConfig, "symbol" | "alias">[]),
    // The close reasons the bot has actually used, so the filter offers what
    // exists rather than a list somebody typed out and let go stale.
    client
      ? client
          .from("bot_trades")
          .select("close_reason")
          .not("close_ts", "is", null)
          .not("close_reason", "is", null)
          .limit(5000)
          .then(
            (r) => (r.data ?? []) as Pick<BotTrade, "close_reason">[],
            () => [] as Pick<BotTrade, "close_reason">[],
          )
      : Promise.resolve([] as Pick<BotTrade, "close_reason">[]),
  ]);

  const money = (n: number) => `$${Math.abs(n).toFixed(2)}`;
  const { totals } = history;
  const decided = totals.wins + totals.losses;

  const markets: FilterOption[] = configs
    .map((c) => ({
      value: c.symbol,
      label: c.alias && c.alias !== c.symbol ? `${c.alias} — ${c.symbol}` : c.symbol,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const reasons: FilterOption[] = [
    ...new Set(reasonRows.map((r) => r.close_reason).filter(Boolean) as string[]),
  ]
    .sort()
    .map((value) => ({ value, label: humanise(value) }));

  // Every param except page, so sort links and the pager agree about the view
  // they are changing.
  const base = new URLSearchParams();
  base.set("range", range);
  base.set("view", view);
  if (params.from) base.set("from", params.from);
  if (params.to) base.set("to", params.to);
  if (symbol) base.set("symbol", symbol);
  if (side) base.set("side", side);
  if (outcome !== "all") base.set("outcome", outcome);
  if (reason) base.set("reason", reason);

  const sortHref = (key: SortKey) => {
    const next = new URLSearchParams(base.toString());
    next.set("sort", key);
    // Clicking the active column flips it; another starts descending, which is
    // the useful default for every column here.
    next.set("dir", sort === key && dir === "desc" ? "asc" : "desc");
    return `/app/admin/history?${next.toString()}`;
  };

  const pageHref = (target: number) => {
    const next = new URLSearchParams(base.toString());
    next.set("sort", sort);
    next.set("dir", dir);
    next.set("page", String(target));
    return `/app/admin/history?${next.toString()}`;
  };

  return (
    <div>
      {/* No visible page title — see the note on the overview page. The h1
          stays screen-reader-only so the document still has a landmark. */}
      <h1 className="sr-only">History</h1>

      <div className="mb-6 flex flex-wrap items-end justify-end gap-4">
        <RangePicker current={range} basePath="/app/admin/history" />
      </div>

      {!history.connected ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
          rm-server is not configured, so there is no history to read.
        </p>
      ) : (
        <>
          {/* The totals describe the RANGE AS FILTERED, from their own query.
              They do not move when you page through the table. */}
          <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label={`Made — ${RANGE_LABELS[range].toLowerCase()}`}
              value={<Signed value={totals.net} format={money} />}
            />
            <Stat
              label="Trades"
              value={String(totals.trades)}
              note={`${totals.wins}W / ${totals.losses}L`}
            />
            <Stat
              label="Win rate"
              value={
                decided === 0
                  ? "—"
                  : `${((totals.wins / decided) * 100).toFixed(1)}%`
              }
              note="Scratches excluded"
            />
            <Stat
              label="Profit factor"
              value={
                totals.profitFactor === null
                  ? "No losses"
                  : totals.profitFactor.toFixed(2)
              }
            />
          </dl>

          <div className="mt-8">
            <HistoryFilters
              view={view}
              markets={markets}
              reasons={reasons}
              current={{
                symbol,
                side,
                outcome: outcome === "all" ? null : outcome,
                reason,
              }}
            />
          </div>

          {history.truncated ? (
            <p className="mt-4 rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 text-xs leading-relaxed">
              The outcome filter is applied to the result after costs, which the
              database cannot do — so it reads the range and filters here. This
              one hit the 20,000-trade cap, and the figures describe the most
              recent 20,000 rather than everything.
            </p>
          ) : null}

          <div className="mt-6">
            {view === "markets" ? (
              <MarketBreakdownTable
                markets={breakdown.markets}
                truncated={breakdown.truncated}
              />
            ) : (
              <>
                <p className="mb-3 text-xs text-fg-muted">
                  {history.total === 0
                    ? "Nothing matches"
                    : `${history.total} trade${history.total === 1 ? "" : "s"} · page ${history.page} of ${history.pages}`}
                  {sort === "duration" ? " · held-time sorts within the page" : ""}
                </p>

                {history.rows.length === 0 ? (
                  <p className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
                    No closed trades match those filters in this range.
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
                            {SORTS.map((column) => (
                              <th
                                key={column.key}
                                scope="col"
                                className={`py-2 pr-4 font-medium ${
                                  column.align === "right" ? "text-right" : ""
                                }`}
                                aria-sort={
                                  sort === column.key
                                    ? dir === "asc"
                                      ? "ascending"
                                      : "descending"
                                    : "none"
                                }
                              >
                                <Link
                                  href={sortHref(column.key)}
                                  className={`inline-flex items-center gap-1 transition-colors hover:text-fg ${
                                    sort === column.key ? "text-accent" : ""
                                  }`}
                                >
                                  {column.label}
                                  {sort === column.key ? (
                                    <span aria-hidden="true">
                                      {dir === "asc" ? "↑" : "↓"}
                                    </span>
                                  ) : null}
                                </Link>
                              </th>
                            ))}
                            <th scope="col" className="py-2 pr-4 font-medium">
                              Side
                            </th>
                            <th scope="col" className="py-2 pr-4 text-right font-medium">
                              Why
                            </th>
                            <th scope="col" className="py-2 font-medium">
                              {/* Named, not blank: a column with no header is
                                  one a screen reader announces as nothing. */}
                              <span className="sr-only">Trade review</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {history.rows.map((row) => (
                            <tr key={row.id}>
                              <th scope="row" className="py-2.5 pr-4 font-normal">
                                <Link
                                  href={`/app/admin/markets/${encodeURIComponent(row.symbol)}`}
                                  className="font-medium hover:text-accent"
                                >
                                  {row.symbol}
                                </Link>
                              </th>
                              <td className="py-2.5 pr-4 tabular-nums text-fg-muted">
                                {stamp(row.open_ts)}
                              </td>
                              <td className="py-2.5 pr-4 tabular-nums text-fg-muted">
                                {stamp(row.close_ts)}
                              </td>
                              <td className="py-2.5 pr-4 text-right tabular-nums text-fg-muted">
                                {row.heldMinutes === null
                                  ? "—"
                                  : held(row.heldMinutes)}
                              </td>
                              <td className="py-2.5 pr-4 text-right tabular-nums">
                                <Signed value={row.net} format={money} />
                              </td>
                              <td className="py-2.5 pr-4 uppercase text-fg-muted">
                                {row.side}
                              </td>
                              <td className="py-2.5 pr-4 text-right text-xs text-fg-muted">
                                {row.close_reason ?? "—"}
                              </td>
                              {/* The review the bot already publishes and
                                  nothing rendered. Collapsed: the method is
                                  chart first, verdict written, THEN open this
                                  — a panel that answers before it is asked
                                  turns a review into agreement. */}
                              <td className="py-2.5">
                                <TradeReview
                                  data={{
                                    entry: row.entry_snapshot,
                                    exit: row.exit_snapshot,
                                    entryTrend: row.entry_trend,
                                    entryHtfTrend: row.entry_htf_trend,
                                    trendAgreement: row.trend_agreement,
                                    mfe: row.mfe ?? null,
                                    mae: row.mae ?? null,
                                    rMultiple: row.r_multiple ?? null,
                                    entrySpread: row.entry_spread,
                                    strategy: row.strategy,
                                    timeframe: row.timeframe,
                                  }}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <Pager
                      page={history.page}
                      pages={history.pages}
                      total={history.total}
                      perPage={history.perPage}
                      href={pageHref}
                    />
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The pager.
 *
 * Says WHICH rows are on screen, not just which page. "26–50 of 138" is the
 * sentence that tells somebody whether they have seen what they came for;
 * "Page 2" does not.
 */
function Pager({
  page,
  pages,
  total,
  perPage,
  href,
}: {
  page: number;
  pages: number;
  total: number;
  perPage: number;
  href: (page: number) => string;
}) {
  const first = (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);

  // Up to seven numbered pages around the current one. Beyond that the numbers
  // stop being a navigation aid and become a wall.
  const window = 3;
  const start = Math.max(1, Math.min(page - window, pages - window * 2));
  const end = Math.min(pages, Math.max(page + window, window * 2 + 1));
  const numbers: number[] = [];
  for (let i = start; i <= end; i += 1) numbers.push(i);

  return (
    <nav
      className="mt-4 flex flex-wrap items-center justify-between gap-3"
      aria-label="History pages"
    >
      <p className="text-xs tabular-nums text-fg-muted">
        {first}–{last} of {total}
      </p>

      <div className="flex items-center gap-1">
        <Step href={href(page - 1)} disabled={page <= 1}>
          Previous
        </Step>
        {start > 1 ? <span className="px-1 text-xs text-fg-subtle">…</span> : null}
        {numbers.map((number) => (
          <Link
            key={number}
            href={href(number)}
            aria-current={number === page ? "page" : undefined}
            className={`rounded-md px-2.5 py-1.5 text-xs tabular-nums transition-colors ${
              number === page
                ? "bg-accent/15 font-medium text-accent"
                : "text-fg-muted hover:text-fg"
            }`}
          >
            {number}
          </Link>
        ))}
        {end < pages ? <span className="px-1 text-xs text-fg-subtle">…</span> : null}
        <Step href={href(page + 1)} disabled={page >= pages}>
          Next
        </Step>
      </div>
    </nav>
  );
}

function Step({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="rounded-md border border-border px-2.5 py-1.5 text-xs text-fg-subtle opacity-50">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="rounded-md border border-border px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
    >
      {children}
    </Link>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
}) {
  return (
    <div className="surface rounded-xl border border-border p-5">
      <dt className="text-xs uppercase tracking-wide text-fg-muted">{label}</dt>
      <dd className="mt-2 text-2xl font-semibold tabular-nums">{value}</dd>
      {note ? <p className="mt-1 text-xs text-fg-muted">{note}</p> : null}
    </div>
  );
}

/** `stop_loss` → `Stop loss`. The column is machine-written; the filter is read. */
function humanise(value: string): string {
  const words = value.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

function stamp(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function held(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
