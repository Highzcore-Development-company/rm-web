"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Narrow a table to one market.
 *
 * A plain select rather than a search box: there are thirty markets, the names
 * are not guessable (EURUSD+ with the Raw ECN suffix, not EURUSD), and typing
 * one that does not exist returns an empty table that reads as "no trades"
 * instead of "no such market".
 *
 * Changing the market RESETS the page, for the same reason the range does:
 * page 7 of one market is almost never a page that exists.
 */
export function MarketFilter({
  markets,
  current,
}: {
  markets: { symbol: string; alias: string }[];
  current: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  if (markets.length === 0) return null;

  return (
    <label className="text-xs">
      <span className="mb-1 block text-fg-muted">Market</span>
      <select
        value={current ?? ""}
        onChange={(event) => {
          const next = new URLSearchParams(params.toString());
          if (event.target.value) next.set("symbol", event.target.value);
          else next.delete("symbol");
          next.delete("page");
          router.push(`${pathname}?${next.toString()}`);
        }}
        className="min-w-[12rem] rounded-lg border border-border bg-bg px-3 py-2 text-sm"
      >
        <option value="">Every market</option>
        {markets
          .slice()
          .sort((a, b) => a.alias.localeCompare(b.alias))
          .map((market) => (
            <option key={market.symbol} value={market.symbol}>
              {market.alias === market.symbol
                ? market.symbol
                : `${market.alias} — ${market.symbol}`}
            </option>
          ))}
      </select>
    </label>
  );
}
