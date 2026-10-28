"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import {
  setCloseAtProfit,
  setLotSize,
} from "@/app/(app)/app/admin/(panel)/bot/actions";
import { useToast } from "@/stores";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  formatPipAmount,
  lotsForPipValue,
  pipValueFor,
  type Quotes,
} from "@/lib/admin/pip-value";
import { parseMoney } from "@/lib/price";
import type { MarketConfig } from "@/components/admin/bot-controls";

/**
 * Set size and profit target across many markets at once.
 *
 * Victor, 26 Oct, three things in one message:
 *
 *   "you've been struggling to make all markets have $0.30 per pip, where it
 *    only calculates via lots, not via the dollar"
 *   "you were manually changing it one by one, where you can change things in
 *    bulk at once, especially when you're looking for the same result"
 *   "keep it at $5 target — you'll manually go and change one by one, where
 *    you can select the markets and do it in one place"
 *
 * RISK IS DECIDED IN MONEY, NOT IN LOTS. "$0.30 a pip everywhere" is one
 * decision; the lot size that produces it is seventeen different numbers that
 * move with the exchange rate. Asking a person to convert each one is asking
 * them to do arithmetic this page already does to render the line under the
 * box — it just never ran it backwards.
 *
 * NOTHING IS APPLIED WITHOUT SHOWING EVERY ROW FIRST. One mistyped figure
 * here lands on every selected market, so the confirmation lists each symbol
 * with its before and after — and for a $/pip target, the lot size it worked
 * out AND what that size really costs after rounding to the broker's step.
 * "0.01 → 0.03 ($0.28/pip)" is a sentence somebody can catch an error in.
 *
 * PARTIAL FAILURE IS REPORTED, NOT SWALLOWED. Each market is its own write
 * and one can be refused while the rest succeed. A toast saying "done" over
 * four silent failures is worse than no toast.
 */

type Mode = "pip" | "lots";

export function BulkMarketSettings({
  markets,
  configurable,
  quotes = {},
}: {
  markets: MarketConfig[];
  configurable: boolean;
  quotes?: Quotes;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>("pip");
  const [sizeText, setSizeText] = useState("");
  const [profitText, setProfitText] = useState("");
  const [confirming, setConfirming] = useState(false);
  /** Per-symbol outcome of the last run, so a partial failure stays visible. */
  const [failed, setFailed] = useState<string[]>([]);

  const chosen = markets.filter((m) => picked.has(m.symbol));
  const allPicked = picked.size === markets.length && markets.length > 0;

  function toggle(symbol: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  }

  /**
   * What each selected market would become.
   *
   * Computed for the confirmation AND for the run, from one function, so the
   * list somebody approves is literally the list that gets written. Two
   * separate derivations would eventually disagree, and the disagreement
   * would be invisible until it had already been applied.
   */
  const plan = chosen.map((m) => {
    const size = parseMoney(sizeText);
    let lots: number | null = null;

    if (size !== null && Number.isFinite(size)) {
      lots = mode === "pip" ? lotsForPipValue(m.symbol, size, quotes) : size;
    }

    const value = lots !== null ? pipValueFor(m.symbol, lots, quotes) : null;
    const profit = parseMoney(profitText);

    return {
      symbol: m.symbol,
      alias: m.alias || m.symbol,
      fromLots: m.lotSize,
      toLots: lots,
      // What the rounded size actually costs. The gap between what was asked
      // for and what the broker's 0.01 step allows has to be visible.
      costs: value && value.kind === "known" ? formatPipAmount(value) : null,
      fromProfit: m.closeAtProfit,
      toProfit: profit !== null && Number.isFinite(profit) ? profit : null,
    };
  });

  const sizeBad = sizeText.trim() !== "" && !Number.isFinite(parseMoney(sizeText) ?? NaN);
  const profitBad =
    profitText.trim() !== "" && !Number.isFinite(parseMoney(profitText) ?? NaN);
  // A market we cannot price has no lot size to offer, and silently skipping
  // it would mean "apply to all" quietly meant "apply to most".
  const unpriceable = plan.filter((p) => sizeText.trim() !== "" && p.toLots === null);

  const nothingToDo = sizeText.trim() === "" && profitText.trim() === "";
  const canApply =
    configurable &&
    chosen.length > 0 &&
    !nothingToDo &&
    !sizeBad &&
    !profitBad &&
    unpriceable.length === 0;

  function run() {
    start(async () => {
      const problems: string[] = [];

      // Sequential on purpose. Seventeen parallel writes to one table through
      // one PostgREST connection is a burst that can partially fail for
      // reasons that have nothing to do with the values — and this is the
      // size of live trades.
      for (const p of plan) {
        if (p.toLots !== null) {
          const res = await setLotSize(p.symbol, p.toLots);
          if (!res.ok) problems.push(`${p.alias} (size)`);
        }
        if (profitText.trim() !== "" && p.toProfit !== null) {
          const res = await setCloseAtProfit(p.symbol, p.toProfit);
          if (!res.ok) problems.push(`${p.alias} (target)`);
        }
      }

      setConfirming(false);
      setFailed(problems);

      if (problems.length === 0) {
        toast.success(
          `Updated ${plan.length} market${plan.length === 1 ? "" : "s"}.`,
        );
        setPicked(new Set());
        setSizeText("");
        setProfitText("");
        setOpen(false);
      } else {
        toast.error(
          `${problems.length} of ${plan.length} did not save. They are listed below.`,
        );
      }
      router.refresh();
    });
  }

  if (!configurable) return null;

  return (
    <div className="mb-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Set several markets at once</p>
          <p className="mt-0.5 text-xs text-fg-muted">
            Risk in dollars per pip, and the lot size is worked out for each
            market.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm text-fg-muted transition-colors hover:text-fg"
        >
          {open ? "Close" : "Open"}
        </button>
      </div>

      {open ? (
        <div className="mt-4 space-y-4">
          {/* ---------- which markets ---------- */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                Markets ({picked.size} of {markets.length})
              </p>
              <button
                type="button"
                onClick={() =>
                  setPicked(
                    allPicked ? new Set() : new Set(markets.map((m) => m.symbol)),
                  )
                }
                className="text-xs text-accent underline underline-offset-2"
              >
                {allPicked ? "Clear all" : "Select all"}
              </button>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {markets.map((m) => {
                const on = picked.has(m.symbol);
                return (
                  <button
                    key={m.symbol}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(m.symbol)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                      on
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-fg-muted hover:border-fg-subtle"
                    }`}
                  >
                    {on ? <Check className="size-3" aria-hidden="true" /> : null}
                    {m.alias || m.symbol}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ---------- what to set ---------- */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="flex items-center gap-2">
                <label htmlFor="bulk-size" className="text-xs font-medium">
                  Size
                </label>
                {/* The two ways of saying the same thing. $/pip leads because
                    it is the one that means the same on every market. */}
                <div className="flex rounded-lg border border-border p-0.5">
                  {(["pip", "lots"] as Mode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={mode === m}
                      onClick={() => setMode(m)}
                      className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                        mode === m
                          ? "bg-accent/15 text-accent"
                          : "text-fg-muted hover:text-fg"
                      }`}
                    >
                      {m === "pip" ? "$ per pip" : "lots"}
                    </button>
                  ))}
                </div>
              </div>
              <input
                id="bulk-size"
                inputMode="decimal"
                value={sizeText}
                onChange={(e) => setSizeText(e.target.value)}
                placeholder={mode === "pip" ? "0.30" : "0.01"}
                className={`mt-2 w-full rounded-lg border bg-bg px-3 py-2 text-sm ${
                  sizeBad ? "border-chart-down" : "border-border"
                }`}
              />
              <p className="mt-1 text-[11px] text-fg-muted">
                {sizeBad
                  ? "That is not a number."
                  : mode === "pip"
                    ? "The same risk on every market. Lot size is rounded down to 0.01."
                    : "The same lot size on every market — risk will differ per market."}
              </p>
            </div>

            <div>
              <label htmlFor="bulk-profit" className="text-xs font-medium">
                Close at profit
              </label>
              <input
                id="bulk-profit"
                inputMode="decimal"
                value={profitText}
                onChange={(e) => setProfitText(e.target.value)}
                placeholder="5"
                className={`mt-2 w-full rounded-lg border bg-bg px-3 py-2 text-sm ${
                  profitBad ? "border-chart-down" : "border-border"
                }`}
              />
              <p className="mt-1 text-[11px] text-fg-muted">
                {profitBad
                  ? "That is not a number."
                  : "Dollars. Leave blank to change only the size."}
              </p>
            </div>
          </div>

          {unpriceable.length > 0 ? (
            <p className="rounded-lg border border-chart-down/40 bg-chart-down/5 px-3 py-2 text-xs text-fg-muted">
              No pip value for {unpriceable.map((p) => p.alias).join(", ")} — no
              live quote and nothing measured. Deselect{" "}
              {unpriceable.length === 1 ? "it" : "them"} or set the size in lots.
            </p>
          ) : null}

          {failed.length > 0 ? (
            <p className="rounded-lg border border-chart-down/40 bg-chart-down/5 px-3 py-2 text-xs text-fg-muted">
              Did not save: {failed.join(", ")}. Everything else went through.
            </p>
          ) : null}

          <button
            type="button"
            disabled={!canApply || pending}
            onClick={() => setConfirming(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-[#0A0A0A] disabled:opacity-50 sm:w-auto"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            Review {chosen.length} market{chosen.length === 1 ? "" : "s"}
          </button>
        </div>
      ) : null}

      {confirming ? (
        <ConfirmDialog
          title={`Change ${plan.length} market${plan.length === 1 ? "" : "s"}?`}
          subject="The master account, and every linked investor"
          body="This is the size of live trades. Check every line — one wrong figure here lands on all of them."
          action={`Apply to ${plan.length}`}
          destructive
          pending={pending}
          onCancel={() => setConfirming(false)}
          onConfirm={run}
        >
          {/* EVERY ROW, with both numbers. Not a count — a count is not
              something anyone can check. */}
          <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-surface text-fg-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Market</th>
                  <th scope="col" className="px-3 py-2 font-medium">Lots</th>
                  <th scope="col" className="px-3 py-2 font-medium">Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {plan.map((p) => (
                  <tr key={p.symbol}>
                    <td className="px-3 py-2">{p.alias}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {p.toLots === null ? (
                        <span className="text-fg-subtle">unchanged</span>
                      ) : (
                        <>
                          {p.fromLots ?? "0.01"} → <strong>{p.toLots}</strong>
                          {/* What the rounded size really costs. The gap
                              between asked-for and achievable is the thing
                              most worth seeing before approving. */}
                          {p.costs ? (
                            <span className="text-fg-subtle"> ({p.costs}/pip)</span>
                          ) : null}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {p.toProfit === null ? (
                        <span className="text-fg-subtle">unchanged</span>
                      ) : (
                        <>
                          {p.fromProfit ?? "none"} → <strong>${p.toProfit}</strong>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
