"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { RANGE_KEYS, RANGE_LABELS, type RangeKey } from "@/lib/admin/ranges";

/**
 * The date-range control.
 *
 * Victor: "so we know how much was made today, 2 days, 3 days, 7 days, 1 week,
 * 1 months sorting anyhow we want to set the range".
 *
 * IN THE URL, not in component state. Three things follow from that and all
 * three are the point: the range survives a refresh, it can be linked to
 * ("here is the week that went wrong"), and the server reads it directly so
 * the rows and the totals come from one query instead of being filtered after
 * the fact in the browser.
 *
 * Changing the range RESETS the page. Page 7 of "today" is almost never a
 * page that exists, and landing on an empty table reads as "no trades" rather
 * than "wrong page".
 */
export function RangePicker({
  current,
  basePath,
}: {
  current: RangeKey;
  basePath: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");
  const [showCustom, setShowCustom] = useState(current === "custom");

  function go(range: RangeKey, bounds?: { from?: string; to?: string }) {
    const next = new URLSearchParams(params.toString());
    next.set("range", range);

    if (range === "custom") {
      if (bounds?.from) next.set("from", bounds.from);
      else next.delete("from");
      if (bounds?.to) next.set("to", bounds.to);
      else next.delete("to");
    } else {
      // Stale custom bounds left in the URL would be applied by any later
      // switch back to custom without the admin having chosen them again.
      next.delete("from");
      next.delete("to");
    }

    next.delete("page");
    router.push(`${pathname || basePath}?${next.toString()}`);
  }

  // Custom is a panel rather than a button, so it is listed separately.
  const quick = RANGE_KEYS.filter((key) => key !== "custom");

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap gap-1 rounded-lg border border-border p-0.5">
        {quick.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setShowCustom(false);
              go(key);
            }}
            aria-pressed={current === key}
            className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              current === key
                ? "bg-accent/15 text-accent"
                : "text-fg-muted hover:text-fg"
            }`}
          >
            {RANGE_LABELS[key]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowCustom((v) => !v)}
          aria-pressed={current === "custom"}
          aria-expanded={showCustom}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
            current === "custom"
              ? "bg-accent/15 text-accent"
              : "text-fg-muted hover:text-fg"
          }`}
        >
          <CalendarRange className="size-3.5" aria-hidden="true" />
          {RANGE_LABELS.custom}
        </button>
      </div>

      {showCustom ? (
        <form
          className="surface flex flex-wrap items-end gap-2 rounded-lg border border-border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            go("custom", { from, to });
          }}
        >
          <label className="text-xs">
            <span className="mb-1 block text-fg-muted">From</span>
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="rounded-md border border-border bg-bg px-2 py-1.5 text-xs"
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-fg-muted">To</span>
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="rounded-md border border-border bg-bg px-2 py-1.5 text-xs"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-[#0A0A0A] hover:bg-accent-hot"
          >
            Apply
          </button>
          {/* Both ends optional: "since the cutover, to whenever" is a real
              question and refusing it would mean typing today's date to ask it. */}
          <p className="w-full text-[11px] text-fg-subtle">
            Either end may be left blank. The end date is included in full.
          </p>
        </form>
      ) : null}
    </div>
  );
}
