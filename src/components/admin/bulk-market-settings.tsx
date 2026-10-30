"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { setMarketSettingsBulk } from "@/app/(app)/app/admin/(panel)/bot/actions";
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
 * IT IS ONE SERVER CALL, not one per market. The first version looped, and
 * since Next runs a client's server actions one at a time, 28 markets became
 * 28 queued round trips — each re-checking the permission, writing its own
 * audit row and revalidating the page. The dialog sat on "Working…" long
 * enough to look hung. See run().
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

  /**
   * ONE CALL, not one per market.
   *
   * This looped over the plan calling setLotSize and setCloseAtProfit per
   * symbol. Next runs a client's server actions ONE AT A TIME, and each of
   * those re-checked the permission, wrote its own audit row and revalidated
   * the page — so 28 markets was 28 queued round trips and the dialog sat on
   * "Working…" long enough to look hung. It was not hung. It was doing the
   * same work twenty-eight times.
   *
   * The server now takes the whole plan: the profit target is one statement
   * because it is one value, and lot sizes are grouped by size.
   */
  function run() {
    start(async () => {
      const lots: Record<string, number> = {};
      for (const p of plan) {
        if (p.toLots !== null) lots[p.symbol] = p.toLots;
      }

      const profit = parseMoney(profitText);
      const res = await setMarketSettingsBulk({
        symbols: plan.map((p) => p.symbol),
        lots,
        // undefined means "leave it alone"; null would CLEAR every target.
        ...(profitText.trim() === "" ? {} : { closeAtProfit: profit }),
      });

      setConfirming(false);

      if (res.ok) {
        setFailed([]);
        toast.success(
          `Updated ${res.changed ?? plan.length} market` +
            `${(res.changed ?? plan.length) === 1 ? "" : "s"}.`,
        );
        setPicked(new Set());
        setSizeText("");
        setProfitText("");
        setOpen(false);
      } else {
        // Named rather than counted: the whole batch is one statement now, so
        // a failure is the batch, not a subset.
        setFailed([MESSAGES[res.error] ?? MESSAGES.generic]);
        toast.error(MESSAGES[res.error] ?? MESSAGES.generic);
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
              {failed.join(" ")}
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

const MESSAGES: Record<string, string> = {
  forbidden: "You do not have permission to configure the bot.",
  not_connected: "Not connected to the bot. Nothing was changed.",
  no_markets: "Pick at least one market.",
  bad_lot: "A lot size must be a number greater than zero.",
  bad_profit: "A profit target must be a number greater than zero.",
  refused: "The bot refused the change. Nothing was altered.",
  generic: "That did not reach the bot. Nothing was changed.",
};
