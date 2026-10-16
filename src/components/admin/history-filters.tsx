"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

/**
 * The history filters — view, market, side, outcome and close reason.
 *
 * EVERY ONE OF THEM IS IN THE URL. Victor: "add them to the route so I can
 * refresh and it will still be there." Three things follow and all three are
 * the point: a view survives a refresh, it can be sent to somebody ("here is
 * the week GBPNZD went wrong, sells only"), and the server reads it directly
 * so the figures above the table describe the same set the table is showing.
 *
 * Changing any filter RESETS the page. Page 7 of "today, sells, losses" is
 * almost never a page that exists, and landing on an empty table reads as "no
 * trades" rather than "wrong page".
 */

export type FilterOption = { value: string; label: string };

export function HistoryFilters({
  view,
  markets,
  reasons,
  current,
}: {
  view: "markets" | "trades";
  markets: FilterOption[];
  reasons: FilterOption[];
  current: {
    symbol: string | null;
    side: string | null;
    outcome: string | null;
    reason: string | null;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function set(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }

  const active =
    Boolean(current.symbol) ||
    Boolean(current.side) ||
    Boolean(current.outcome) ||
    Boolean(current.reason);

  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* The view. Two tabs rather than two sections stacked down the page —
          "make it easier for me to switch to market and trades". */}
      <div
        role="tablist"
        aria-label="History view"
        className="flex rounded-lg border border-border p-0.5"
      >
        {(
          [
            { key: "markets", label: "By market" },
            { key: "trades", label: "Trades" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={view === tab.key}
            onClick={() => set({ view: tab.key })}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              view === tab.key
                ? "bg-accent/15 text-accent"
                : "text-fg-muted hover:text-fg"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Select
        label="Market"
        value={current.symbol}
        onChange={(v) => set({ symbol: v })}
        all="Every market"
        options={markets}
      />

      <Select
        label="Side"
        value={current.side}
        onChange={(v) => set({ side: v })}
        all="Both"
        options={[
          { value: "buy", label: "Buy" },
          { value: "sell", label: "Sell" },
        ]}
      />

      <Select
        label="Outcome"
        value={current.outcome}
        onChange={(v) => set({ outcome: v })}
        all="Any"
        options={[
          { value: "won", label: "Won" },
          { value: "lost", label: "Lost" },
          { value: "scratch", label: "Scratched" },
        ]}
      />

      {reasons.length > 0 ? (
        <Select
          label="Closed by"
          value={current.reason}
          onChange={(v) => set({ reason: v })}
          all="Any reason"
          options={reasons}
        />
      ) : null}

      {active ? (
        <button
          type="button"
          onClick={() =>
            set({ symbol: null, side: null, outcome: null, reason: null })
          }
          className="mb-0.5 inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-xs text-fg-muted transition-colors hover:text-fg"
        >
          <X className="size-3.5" aria-hidden="true" />
          Clear
        </button>
      ) : null}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  all,
  options,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  /** The label for "no filter" — never an empty option with no words in it. */
  all: string;
  options: FilterOption[];
}) {
  return (
    <label className="text-xs">
      <span className="mb-1 block text-fg-muted">{label}</span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        className={`min-w-[9rem] rounded-lg border bg-bg px-2.5 py-2 text-sm ${
          value ? "border-accent/40 text-accent" : "border-border"
        }`}
      >
        <option value="">{all}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Search within the by-market table.
 *
 * Separate from the selects above because it filters rows already on the page
 * rather than changing what is fetched — the by-market breakdown is one read
 * of the whole range, so narrowing it is instant and involving the server
 * would only add a round trip.
 */
export function MarketSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Find a market"
        aria-label="Find a market"
        className="w-44 rounded-lg border border-border bg-bg py-1.5 pl-8 pr-3 text-xs"
      />
    </label>
  );
}
