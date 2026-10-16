import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/admin";
import { createRmServerClient } from "@/lib/supabase/rm-server";
import {
  getHistory,
  getMarketBreakdown,
  type SortDir,
  type SortKey,
} from "@/lib/admin/history";
import { isRangeKey, RANGE_LABELS, type RangeKey } from "@/lib/admin/ranges";
import { RangePicker } from "@/components/admin/range-picker";
import { Signed } from "@/components/admin/signed";
import { MarketFilter } from "@/components/admin/market-filter";
import type { BotConfig } from "@/lib/workspace/types";

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

/**
 * History — everything that closed, over whatever range is asked for.
 *
 * Victor: "History of the market based on results we have and make us be able
 * to sort so we know how much was made today, 2 days, 3 days, 7 days, 1 week,
 * 1 months sorting anyhow we want to set the range with proper pagnition, I
 * also want to sort per market so I can see the progress of each market, and
 * their performance."
 *
 * THE RANGE, THE SORT, THE MARKET AND THE PAGE ARE ALL IN THE URL. The server
 * reads them and the database does the filtering, ordering and paging — so the
 * totals above the table describe the range rather than the page, and a view
 * worth showing somebody can be sent as a link.
 *
 * Two tables, deliberately. The per-market breakdown answers "which markets are
 * working" and cannot be read off a page of trades; the trade list answers
 * "what happened". One table cannot do both without one of the answers being
 * wrong.
 */
export default async function AdminHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    from?: string;
    to?: string;
    symbol?: string;
    sort?: string;
    dir?: string;
    page?: string;
  }>;
}) {
  if (!(await requirePermission("bot.view"))) notFound();

  const params = await searchParams;
  const range: RangeKey = isRangeKey(params.range) ? params.range : "7d";
  const sort: SortKey = isSortKey(params.sort) ? params.sort : "closed";
  const dir: SortDir = params.dir === "asc" ? "asc" : "desc";
  const page = Math.max(Number(params.page ?? 1) || 1, 1);
  const symbol = params.symbol?.trim() || null;

  const client = createRmServerClient();

  const [history, breakdown, configs] = await Promise.all([
    getHistory({
      range,
      from: params.from,
      to: params.to,
      symbol,
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
  ]);

  const money = (n: number) => `$${Math.abs(n).toFixed(2)}`;
  const { totals } = history;
  const decided = totals.wins + totals.losses;

  // Every param except page, so the sort links and the pager agree about the
  // view they are changing.
  const base = new URLSearchParams();
  base.set("range", range);
  if (params.from) base.set("from", params.from);
  if (params.to) base.set("to", params.to);
  if (symbol) base.set("symbol", symbol);

  const sortHref = (key: SortKey) => {
    const next = new URLSearchParams(base.toString());
    next.set("sort", key);
    // Clicking the active column flips it; clicking another starts descending,
    // which is the useful default for every column here.
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
      {/* NO VISIBLE PAGE TITLE. Victor, 16 Oct: "remove all title from each
          pages, I don't like it... Keep it without any title." The sidebar
          already says which page this is, so the heading and its blurb were
          repeating it back.

          The h1 stays, screen-reader-only: a document with no h1 gives an
          assistive reader no landmark to jump to and no idea what it has
          landed on, and "invisible" is not the same as "absent". */}
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
          {/* The totals describe the RANGE, from their own query. They do not
              move when you page through the table. */}
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

          {/* ---- per market ---- */}
          <section className="mt-10">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-medium">By market</h2>
              <p className="text-xs text-fg-muted">
                Worst first
                {breakdown.truncated
                  ? " · most recent 20,000 trades"
                  : ""}
              </p>
            </div>

            {breakdown.markets.length === 0 ? (
              <p className="mt-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
                Nothing closed in this range.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
                      <th scope="col" className="py-2 pr-4 font-medium">Market</th>
                      <th scope="col" className="py-2 pr-4 text-right font-medium">Net</th>
                      <th scope="col" className="py-2 pr-4 text-right font-medium">Trades</th>
                      <th scope="col" className="py-2 pr-4 text-right font-medium">Win rate</th>
                      <th scope="col" className="py-2 pr-4 text-right font-medium">PF</th>
                      <th scope="col" className="py-2 pr-4 text-right font-medium">Best</th>
                      <th scope="col" className="py-2 text-right font-medium">Worst</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {breakdown.markets.map((market) => (
                      <tr key={market.symbol}>
                        <th scope="row" className="py-2.5 pr-4 font-normal">
                          <Link
                            href={`/app/admin/markets/${encodeURIComponent(market.symbol)}`}
                            className="font-medium hover:text-accent"
                          >
                            {market.symbol}
                          </Link>
                        </th>
                        <td className="py-2.5 pr-4 text-right tabular-nums">
                          <Signed value={market.net} format={money} />
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-fg-muted">
                          {market.trades}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-fg-muted">
                          {market.winRate === null
                            ? "—"
                            : `${(market.winRate * 100).toFixed(0)}%`}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-fg-muted">
                          {market.profitFactor === null
                            ? "—"
                            : market.profitFactor.toFixed(2)}
                        </td>
                        {/* A market with no winning trade has no "best", and
                            one with no loser has no "worst" — zero is the
                            absence of a trade, not a scratch one. Printing it
                            gave "−$0.00", which reads as a tiny loss that
                            never happened. */}
                        <td className="py-2.5 pr-4 text-right tabular-nums text-fg-muted">
                          {market.best === 0 ? "—" : money(market.best)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-fg-muted">
                          {market.worst === 0 ? "—" : `−${money(market.worst)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ---- the trades ---- */}
          <section className="mt-10">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium">Trades</h2>
                <p className="mt-1 text-xs text-fg-muted">
                  {history.total === 0
                    ? "Nothing in this range"
                    : `${history.total} trade${history.total === 1 ? "" : "s"} · page ${history.page} of ${history.pages}`}
                  {sort === "duration" ? " · held-time sorts within the page" : ""}
                </p>
              </div>
              <MarketFilter
                markets={configs.map((c) => ({
                  symbol: c.symbol,
                  alias: c.alias || c.symbol,
                }))}
                current={symbol}
              />
            </div>

            {history.rows.length === 0 ? (
              <p className="mt-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
                No closed trades in this range
                {symbol ? ` on ${symbol}` : ""}.
              </p>
            ) : (
              <>
                <div className="mt-3 overflow-x-auto">
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
                        <th scope="col" className="py-2 pr-4 font-medium">Side</th>
                        <th scope="col" className="py-2 text-right font-medium">Why</th>
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
                            {row.heldMinutes === null ? "—" : held(row.heldMinutes)}
                          </td>
                          <td className="py-2.5 pr-4 text-right tabular-nums">
                            <Signed value={row.net} format={money} />
                          </td>
                          <td className="py-2.5 pr-4 uppercase text-fg-muted">
                            {row.side}
                          </td>
                          <td className="py-2.5 text-right text-xs text-fg-muted">
                            {row.close_reason ?? "—"}
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
          </section>
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
      <p className="text-xs text-fg-muted tabular-nums">
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
