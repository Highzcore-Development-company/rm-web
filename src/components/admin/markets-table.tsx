"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CandlestickChart, ChevronRight, Maximize2, Search } from "lucide-react";
import { Signed } from "@/components/admin/signed";
import { MarketStateDialog } from "@/components/admin/market-state-dialog";
import { useLiveMarkets } from "@/components/workspace/use-live-markets";
import { TimeAgo, useStale } from "@/components/workspace/bot-bits";
import type { BotMarket } from "@/lib/workspace/types";

/**
 * The markets table — sortable and filterable on everything.
 *
 * Victor: "I should be able to sort and filter with almost everything
 * including win rate."
 *
 * SORTED IN THE BROWSER, not in the URL, and that is the opposite of what
 * History does. The difference is the row count: there are 28 markets and all
 * 28 are already on the page, so sorting is a reorder of an array somebody is
 * looking at — instant, and no reason to involve the server. History pages
 * through thousands of trades, where sorting in the browser would order the
 * page rather than the data and quietly lie. Same question, different answer,
 * because the data is a different size.
 *
 * The date range stays in the URL, because that one does change what is
 * fetched.
 */

export type MarketRow = {
  symbol: string;
  alias: string;
  /** "active" | "ready" | "monitoring" | null */
  state: string | null;
  reason: string | null;
  openPnl: number | null;
  enabled: boolean;
  lots: number | null;
  /** Null when no quote was available to price it. */
  pipUsd: number | null;
  closeAtProfit: number | null;
  /** When the bot last wrote this market's state. */
  updatedAt: string | null;
  net: number | null;
  trades: number | null;
  wins: number | null;
  losses: number | null;
  winRate: number | null;
  profitFactor: number | null;
};

type SortKey =
  | "alias"
  | "state"
  | "net"
  | "trades"
  | "winRate"
  | "profitFactor"
  | "lots"
  | "pipUsd"
  | "closeAtProfit";

type Dir = "asc" | "desc";

const COLUMNS: {
  key: SortKey;
  label: string;
  align: "left" | "right";
  /** The direction a first click should use. */
  first: Dir;
}[] = [
  { key: "alias", label: "Market", align: "left", first: "asc" },
  { key: "state", label: "Doing", align: "left", first: "desc" },
  { key: "net", label: "Result", align: "right", first: "desc" },
  { key: "trades", label: "Trades", align: "right", first: "desc" },
  { key: "winRate", label: "Win rate", align: "right", first: "desc" },
  { key: "profitFactor", label: "PF", align: "right", first: "desc" },
  { key: "lots", label: "Lots", align: "right", first: "desc" },
  { key: "pipUsd", label: "Per pip", align: "right", first: "desc" },
  { key: "closeAtProfit", label: "Target", align: "right", first: "desc" },
];

const FILTERS = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "pending", label: "Pending" },
  { key: "traded", label: "Has trades" },
  { key: "losing", label: "Losing" },
  { key: "off", label: "Off" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

/** How a market's state orders when sorting by Doing: busiest first. */
const STATE_RANK: Record<string, number> = {
  active: 3,
  ready: 2,
  monitoring: 1,
};

/** How long without a write before the feed is called stale. */
const STALE_AFTER_MS = 2 * 60_000;

export function MarketsTable({
  rows,
  liveInitial,
}: {
  rows: MarketRow[];
  /** Full state rows, server-rendered, then kept current over the socket. */
  liveInitial: BotMarket[];
}) {
  /**
   * BEST FIRST by default.
   *
   * It was worst-first, on the reasoning that an admin opens this to find what
   * is losing money. Victor asked why the losses were at the top, which is the
   * answer: because somebody decided they should be, and nobody asked. A table
   * that opens on its worst rows reads as bad news whatever the account is
   * doing, and the sort is one click away now either way.
   */
  /**
   * LIVE. Victor: "I need to see what each market is doing in real time."
   *
   * The page is server-rendered, so every Doing cell froze at page load and
   * the table showed what the bot was thinking whenever you happened to
   * navigate. The same realtime subscription the navbar bells use carries all
   * 28 markets on one socket, and it is reference-counted — adding this reader
   * opens nothing new.
   */
  const live = useLiveMarkets(liveInitial);
  const liveBySymbol = useMemo(
    () => new Map(live.map((m) => [m.symbol, m])),
    [live],
  );

  // The newest write across every market. The FEED's clock, not any one row's.
  const lastWrite = useMemo(
    () =>
      live
        .map((m) => m.updated_at)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
    [live],
  );
  const stale = useStale(lastWrite, STALE_AFTER_MS);

  const [showing, setShowing] = useState<BotMarket | null>(null);
  const [sort, setSort] = useState<SortKey>("net");
  const [dir, setDir] = useState<Dir>("desc");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");

  // The performance figures come from the server (they need a range query);
  // the state, reason and open P&L come from the socket. Merged by symbol so
  // one row is one market rather than two half-rows.
  const merged = useMemo(
    () =>
      rows.map((row) => {
        const m = liveBySymbol.get(row.symbol);
        if (!m) return row;
        return {
          ...row,
          state: m.state ?? row.state,
          reason: m.reason ?? row.reason,
          openPnl: m.state === "active" ? (m.pnl ?? null) : null,
          updatedAt: m.updated_at ?? row.updatedAt,
        };
      }),
    [rows, liveBySymbol],
  );

  const visible = useMemo(() => {
    const term = query.trim().toUpperCase();

    const filtered = merged.filter((row) => {
      if (term && !row.symbol.toUpperCase().includes(term) && !row.alias.toUpperCase().includes(term)) {
        return false;
      }
      switch (filter) {
        case "live":
          return row.state === "active";
        case "pending":
          return row.state === "ready";
        case "traded":
          return (row.trades ?? 0) > 0;
        case "losing":
          return (row.net ?? 0) < 0;
        case "off":
          return !row.enabled;
        default:
          return true;
      }
    });

    const value = (row: MarketRow): number | string | null => {
      if (sort === "alias") return row.alias;
      if (sort === "state") return STATE_RANK[row.state ?? ""] ?? 0;
      return row[sort];
    };

    return filtered.slice().sort((a, b) => {
      const av = value(a);
      const bv = value(b);

      // NULL ALWAYS LAST, whichever way the column is pointing. A market with
      // no trades is not the worst performer and not the best — sorting it to
      // either end would read as a result it has not got.
      if (av === null && bv === null) return a.alias.localeCompare(b.alias);
      if (av === null) return 1;
      if (bv === null) return -1;

      const cmp =
        typeof av === "string" && typeof bv === "string"
          ? av.localeCompare(bv)
          : Number(av) - Number(bv);

      // Alphabetical tiebreaker, so equal rows hold a stable order instead of
      // shuffling every time something else is clicked.
      return (dir === "asc" ? cmp : -cmp) || a.alias.localeCompare(b.alias);
    });
  }, [merged, sort, dir, filter, query]);

  function clickColumn(column: (typeof COLUMNS)[number]) {
    if (sort === column.key) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(column.key);
      setDir(column.first);
    }
  }

  const money = (n: number) => `$${Math.abs(n).toFixed(2)}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border border-border p-0.5">
          {FILTERS.map((f) => {
            const n = countFor(merged, f.key);
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  filter === f.key
                    ? "bg-accent/15 text-accent"
                    : "text-fg-muted hover:text-fg"
                }`}
              >
                {f.label}
                {/* The count is on the filter, so you can see there is nothing
                    behind it before clicking into an empty table. */}
                <span className="ml-1.5 tabular-nums opacity-60">{n}</span>
              </button>
            );
          })}
        </div>

        {/* THE FEED'S OWN CLOCK. "I need to know when it updated last so I
            know the server is active in real time update." Green while writes
            are arriving, amber once they stop — and it ticks on its own, so a
            feed that dies while the page is open says so without a refresh. */}
        <span
          className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${
            stale
              ? "border-accent/40 text-accent"
              : "border-chart-up/40 text-chart-up"
          }`}
          title={
            lastWrite
              ? new Date(lastWrite).toLocaleString("en-GB")
              : "The bot has not written since this page loaded"
          }
        >
          <span
            aria-hidden="true"
            className={`size-1.5 rounded-full ${
              stale ? "bg-accent" : "animate-pulse bg-chart-up"
            }`}
          />
          {stale ? "Feed quiet" : "Live"}
          <span className="text-fg-subtle">
            <TimeAgo iso={lastWrite} />
          </span>
        </span>

        <label className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a market"
            aria-label="Find a market"
            className="w-44 rounded-lg border border-border bg-bg py-1.5 pl-8 pr-3 text-xs"
          />
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[60rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    sort === column.key
                      ? dir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  className={`py-2 pr-4 font-medium ${
                    column.align === "right" ? "text-right" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => clickColumn(column)}
                    className={`inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-fg ${
                      sort === column.key ? "text-accent" : ""
                    }`}
                  >
                    {column.label}
                    <span
                      aria-hidden="true"
                      className={sort === column.key ? "" : "opacity-0"}
                    >
                      {dir === "asc" ? "↑" : "↓"}
                    </span>
                  </button>
                </th>
              ))}
              <th scope="col" className="py-2 pr-2 font-medium">
                Chart
              </th>
              <th scope="col" className="py-2">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border">
            {visible.map((row) => {
              const href = `/app/admin/markets/${encodeURIComponent(row.symbol)}`;
              return (
                <tr key={row.symbol} className={row.enabled ? undefined : "opacity-55"}>
                  <th scope="row" className="py-3 pr-4 font-normal">
                    <Link href={href} className="font-medium hover:text-accent">
                      {row.alias}
                    </Link>
                    {row.state === "active" ? (
                      <span className="ml-2 inline-flex items-center gap-1 rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-accent">
                        <span className="size-1 rounded-full bg-accent" aria-hidden="true" />
                        Live
                      </span>
                    ) : row.state === "ready" ? (
                      <span className="ml-2 rounded border border-brand/40 bg-brand/10 px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-brand">
                        Pending
                      </span>
                    ) : null}
                    {!row.enabled ? (
                      <span className="ml-2 rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-fg-muted">
                        Off
                      </span>
                    ) : null}
                    {row.alias !== row.symbol ? (
                      <span className="block font-mono text-[11px] text-fg-subtle">
                        {row.symbol}
                      </span>
                    ) : null}
                  </th>

                  {/* CLICKABLE. "When I click doings it should modal to show
                      me in full what's going on in the backend." The cell can
                      only ever show a truncated sentence; the dialog carries
                      both trends, the routed strategy, the broker's stop and
                      target, and the indicator snapshot behind the reading. */}
                  <td className="py-3 pr-4">
                    <button
                      type="button"
                      onClick={() => {
                        const m = liveBySymbol.get(row.symbol);
                        if (m) setShowing(m);
                      }}
                      disabled={!liveBySymbol.has(row.symbol)}
                      title="See the full state"
                      /* IT HAS TO LOOK CLICKABLE. A <button> is `cursor:
                         default` in every browser — only links get a pointer —
                         so this read as plain text that happened to respond.
                         The pointer is fixed globally now (globals.css); what
                         this adds is a hover surface, a ring and an icon that
                         fades in — three signals, because one of them is colour
                         and this table is already full of colour that means
                         profit and loss. */
                      className="group -mx-2 block w-full max-w-[22rem] rounded-md px-2 py-1 text-left transition-colors hover:bg-surface-hover hover:ring-1 hover:ring-border disabled:hover:bg-transparent disabled:hover:ring-0"
                    >
                      <span className="flex items-center gap-1.5">
                        {row.state === "active" ? (
                          <span className="inline-flex items-center gap-1.5 text-accent">
                            In a trade
                            {row.openPnl !== null ? (
                              <span className="tabular-nums">
                                ({row.openPnl >= 0 ? "+" : "−"}$
                                {Math.abs(row.openPnl).toFixed(2)})
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="min-w-0 flex-1 truncate text-xs text-fg-muted transition-colors group-hover:text-fg">
                            {row.reason ?? (row.state ? "Watching" : "No state")}
                          </span>
                        )}
                        <Maximize2
                          className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-70 group-disabled:hidden"
                          aria-hidden="true"
                        />
                      </span>
                      {/* Per row, because one market going quiet while the
                          rest tick is a different fault from the whole feed
                          stopping, and only a per-row clock shows it. */}
                      <span className="mt-0.5 block text-[10px] text-fg-subtle">
                        <TimeAgo iso={row.updatedAt} />
                      </span>
                    </button>
                  </td>

                  <td className="py-3 pr-4 text-right tabular-nums">
                    {row.net === null ? <Dash /> : <Signed value={row.net} format={money} />}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-fg-muted">
                    {row.trades === null ? <Dash /> : row.trades}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-fg-muted">
                    {row.winRate === null ? (
                      <Dash />
                    ) : (
                      `${(row.winRate * 100).toFixed(0)}%`
                    )}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-fg-muted">
                    {row.profitFactor === null ? (
                      <Dash />
                    ) : (
                      row.profitFactor.toFixed(2)
                    )}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {row.lots ?? <span className="text-fg-muted">0.01 min</span>}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-fg-muted">
                    {row.pipUsd === null ? (
                      <Dash />
                    ) : (
                      `$${row.pipUsd < 0.1 ? row.pipUsd.toFixed(3) : row.pipUsd.toFixed(2)}`
                    )}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-fg-muted">
                    {row.closeAtProfit ? `$${row.closeAtProfit.toFixed(2)}` : <Dash />}
                  </td>

                  <td className="py-3 pr-2">
                    <Link
                      href={`/app/admin/chart?symbol=${encodeURIComponent(row.symbol)}`}
                      className="inline-flex items-center gap-1 text-xs text-fg-muted transition-colors hover:text-accent"
                      aria-label={`Open the chart for ${row.alias}`}
                    >
                      <CandlestickChart className="size-4" aria-hidden="true" />
                      View
                    </Link>
                  </td>
                  <td className="py-3">
                    <Link
                      href={href}
                      className="inline-flex items-center text-fg-subtle transition-colors hover:text-accent"
                      aria-label={`Open ${row.alias}`}
                    >
                      <ChevronRight className="size-4" aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {visible.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
          No market matches that.
        </p>
      ) : null}

      {showing ? (
        // Read from the live map rather than the captured row, so the dialog
        // keeps updating while it is open instead of freezing at the click.
        <MarketStateDialog
          market={liveBySymbol.get(showing.symbol) ?? showing}
          onClose={() => setShowing(null)}
        />
      ) : null}
    </>
  );
}

function countFor(rows: MarketRow[], key: FilterKey): number {
  switch (key) {
    case "live":
      return rows.filter((r) => r.state === "active").length;
    case "pending":
      return rows.filter((r) => r.state === "ready").length;
    case "traded":
      return rows.filter((r) => (r.trades ?? 0) > 0).length;
    case "losing":
      return rows.filter((r) => (r.net ?? 0) < 0).length;
    case "off":
      return rows.filter((r) => !r.enabled).length;
    default:
      return rows.length;
  }
}

function Dash() {
  return <span className="text-fg-subtle">—</span>;
}
