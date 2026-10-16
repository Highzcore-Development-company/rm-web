"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Signed } from "@/components/admin/signed";
import { MarketSearch } from "@/components/admin/history-filters";
import type { MarketPerformance } from "@/lib/admin/history";

/**
 * Per-market performance over the selected range, sortable.
 *
 * The same reasoning as the markets table: every row for the range is already
 * on the page, so sorting is a reorder of an array somebody is looking at.
 * Only the range and the filters that change what is FETCHED belong in the
 * URL, and those are above this component.
 *
 * It opens on net descending — best first — for the same reason the markets
 * page does. It used to open worst-first and Victor asked why the losses were
 * at the top, which was a fair question nobody had put to him.
 */

type SortKey =
  | "symbol"
  | "net"
  | "trades"
  | "winRate"
  | "profitFactor"
  | "best"
  | "worst";

const COLUMNS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "symbol", label: "Market", align: "left" },
  { key: "net", label: "Net", align: "right" },
  { key: "trades", label: "Trades", align: "right" },
  { key: "winRate", label: "Win rate", align: "right" },
  { key: "profitFactor", label: "PF", align: "right" },
  { key: "best", label: "Best", align: "right" },
  { key: "worst", label: "Worst", align: "right" },
];

export function MarketBreakdownTable({
  markets,
  truncated,
}: {
  markets: MarketPerformance[];
  truncated: boolean;
}) {
  const [sort, setSort] = useState<SortKey>("net");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const term = query.trim().toUpperCase();
    const filtered = term
      ? markets.filter((m) => m.symbol.toUpperCase().includes(term))
      : markets;

    return filtered.slice().sort((a, b) => {
      const av = sort === "symbol" ? a.symbol : a[sort];
      const bv = sort === "symbol" ? b.symbol : b[sort];

      // Null last whichever way the column points — a market with nothing
      // decided is neither the best nor the worst.
      if (av === null && bv === null) return a.symbol.localeCompare(b.symbol);
      if (av === null) return 1;
      if (bv === null) return -1;

      const cmp =
        typeof av === "string" && typeof bv === "string"
          ? av.localeCompare(bv)
          : Number(av) - Number(bv);
      return (dir === "asc" ? cmp : -cmp) || a.symbol.localeCompare(b.symbol);
    });
  }, [markets, sort, dir, query]);

  const money = (n: number) => `$${Math.abs(n).toFixed(2)}`;

  function click(key: SortKey) {
    if (sort === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir(key === "symbol" ? "asc" : "desc");
    }
  }

  if (markets.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
        Nothing closed in this range.
      </p>
    );
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fg-muted">
          {rows.length} market{rows.length === 1 ? "" : "s"}
          {truncated ? " · most recent 20,000 trades" : ""}
        </p>
        <MarketSearch value={query} onChange={setQuery} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
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
                    onClick={() => click(column.key)}
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
            </tr>
          </thead>

          <tbody className="divide-y divide-border">
            {rows.map((market) => (
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
                {/* Zero is the absence of a winning (or losing) trade, not a
                    scratch one — printing it gave "−$0.00", which reads as a
                    tiny loss that never happened. */}
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

      {rows.length === 0 ? (
        <p className="mt-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
          No market matches that.
        </p>
      ) : null}
    </>
  );
}
