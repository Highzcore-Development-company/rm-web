"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Pause, Play, Power } from "lucide-react";
import {
  setCloseAtProfit,
  setLotSize,
  setMarketEnabled,
  setTradingEnabled,
} from "@/app/(app)/app/admin/(panel)/bot/actions";
import { useToast } from "@/stores";
import { pipLineFor } from "@/lib/admin/pip-value";

export type MarketConfig = {
  symbol: string;
  alias: string | null;
  lotSize: number | null;
  closeAtProfit: number | null;
  enabled: boolean;
};

/**
 * A8 — the real operator controls.
 *
 * Deliberately NOT in operator-controls.tsx. That file exports these same
 * names as inert stand-ins so the ported investor desk cannot act on the
 * master account, and making them live there would hand every investor a kill
 * switch. The power belongs here, behind bot.configure.
 */

/** The global switch. Given its own treatment because it stops everything. */
export function TradingSwitch({
  enabled,
  configurable,
}: {
  enabled: boolean;
  configurable: boolean;
}) {
  const t = useTranslations("adminBot");
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div
      className={`surface flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5 ${
        enabled ? "border-chart-up/40" : "border-chart-down/40"
      }`}
    >
      <div className="flex items-center gap-4">
        <span
          className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${
            enabled
              ? "bg-chart-up/10 text-chart-up"
              : "bg-chart-down/10 text-chart-down"
          }`}
        >
          <Power className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-medium">
            {enabled ? t("switch.on") : t("switch.off")}
          </p>
          <p className="mt-0.5 text-xs text-fg-muted">
            {t("switch.hint")}
          </p>
        </div>
      </div>

      <button
        type="button"
        disabled={pending || !configurable}
        onClick={() => {
          // Blocking confirm on the way OFF only. Stopping the book is the
          // consequential direction; starting it again is recoverable by
          // pressing the same button.
          if (enabled && !window.confirm(t("switch.confirmOff"))) return;

          start(async () => {
            const res = await setTradingEnabled(!enabled);
            if (res.ok) {
              toast.success(enabled ? t("switch.stopped") : t("switch.started"));
              router.refresh();
            } else toast.error(t(`errors.${res.error}`));
          });
        }}
        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${
          enabled
            ? "border border-chart-down/50 text-fg hover:border-chart-down"
            : "bg-accent text-[#0A0A0A] hover:bg-accent-hot"
        }`}
      >
        {enabled ? (
          <>
            <Pause className="size-4" aria-hidden="true" />
            {t("switch.stop")}
          </>
        ) : (
          <>
            <Play className="size-4" aria-hidden="true" />
            {t("switch.start")}
          </>
        )}
      </button>
    </div>
  );
}

/** Per-market lot size, close-at-profit and enable. */
export function MarketControls({
  markets,
  configurable,
}: {
  markets: MarketConfig[];
  configurable: boolean;
}) {
  const t = useTranslations("adminBot");

  if (markets.length === 0) {
    return <p className="text-sm text-fg-muted">{t("noMarkets")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
            <th scope="col" className="py-2 pr-4 font-medium">{t("cols.market")}</th>
            <th scope="col" className="py-2 pr-4 font-medium">{t("cols.lot")}</th>
            <th scope="col" className="py-2 pr-4 font-medium">{t("cols.profit")}</th>
            <th scope="col" className="py-2 font-medium">{t("cols.enabled")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {markets.map((market) => (
            <MarketRow
              key={market.symbol}
              market={market}
              configurable={configurable}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarketRow({
  market,
  configurable,
}: {
  market: MarketConfig;
  configurable: boolean;
}) {
  const t = useTranslations("adminBot");
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  const [lot, setLot] = useState(market.lotSize?.toString() ?? "");
  const [profit, setProfit] = useState(market.closeAtProfit?.toString() ?? "");

  /**
   * "These controls move real money. Confirm before acting, show what the
   * value was before and what it will be."
   *
   * These three used to commit straight off a blur, which meant tabbing out of
   * a field with a typo in it changed the size of a live trade with no step in
   * between. Nothing is sent until it is confirmed, and the confirmation shows
   * BOTH values — "0.01 → 0.5" is a sentence somebody can catch a mistake in,
   * where "are you sure?" is not.
   */
  const [confirming, setConfirming] = useState<{
    what: "lot" | "profit" | "enabled";
    from: string;
    to: string;
    apply: () => void;
  } | null>(null);

  const blank = t("blankValue");
  const show = (v: string) => (v.trim() === "" ? blank : v);

  function askLot() {
    const was = market.lotSize?.toString() ?? "";
    if (lot === was) return;
    setConfirming({
      what: "lot",
      from: show(was),
      to: show(lot),
      apply: () =>
        start(async () => {
          const res = await setLotSize(market.symbol, Number(lot));
          setConfirming(null);
          if (res.ok) {
            // Says what happens next, because it is not instant: the bot
            // re-reads settings about once a minute and may snap the value.
            toast.success(t("saved.lot", { symbol: market.symbol }));
            router.refresh();
          } else {
            toast.error(t(`errors.${res.error}`));
            setLot(was);
          }
        }),
    });
  }

  function askProfit() {
    const was = market.closeAtProfit?.toString() ?? "";
    if (profit === was) return;
    setConfirming({
      what: "profit",
      from: show(was),
      to: show(profit),
      apply: () =>
        start(async () => {
          const value = profit.trim() === "" ? null : Number(profit);
          const res = await setCloseAtProfit(market.symbol, value);
          setConfirming(null);
          if (res.ok) {
            toast.success(t("saved.profit", { symbol: market.symbol }));
            router.refresh();
          } else {
            toast.error(t(`errors.${res.error}`));
            setProfit(was);
          }
        }),
    });
  }

  function askEnabled(next: boolean) {
    setConfirming({
      what: "enabled",
      from: market.enabled ? t("on") : t("off"),
      to: next ? t("on") : t("off"),
      apply: () =>
        start(async () => {
          const res = await setMarketEnabled(market.symbol, next);
          setConfirming(null);
          if (res.ok) {
            toast.success(
              next
                ? t("saved.enabled", { symbol: market.symbol })
                : t("saved.disabled", { symbol: market.symbol }),
            );
            router.refresh();
          } else toast.error(t(`errors.${res.error}`));
        }),
    });
  }

  function cancel() {
    // Put the inputs back. Leaving the typed value on screen after cancelling
    // would show a number the bot does not have.
    setLot(market.lotSize?.toString() ?? "");
    setProfit(market.closeAtProfit?.toString() ?? "");
    setConfirming(null);
  }

  const row = (
    <tr className={market.enabled ? undefined : "opacity-50"}>
      <th scope="row" className="py-3 pr-4 font-mono text-xs font-normal">
        {market.symbol}
      </th>

      <td className="py-3 pr-4 align-top">
        <input
          inputMode="decimal"
          value={lot}
          disabled={pending || !configurable}
          onChange={(e) => setLot(e.target.value)}
          // Committed on blur and on Enter, not per keystroke: every keystroke
          // would be a write to the bot's database.
          onBlur={askLot}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="field-input w-24 rounded-md px-2 py-1.5 text-sm tabular-nums"
        />

        {/* What this size is actually worth, under the box, updating as it is
            typed. "0.1" means nothing on its own; "$1.00 a pip" is the number
            a person reasons with, and lot size is the one setting that decides
            how much money a trade moves.

            Shown for the TYPED value, not the saved one — the point is to see
            what you are about to do before confirming it. Blank when we have
            no figure for the market, because a confident wrong number here is
            worse than none. */}
        <p className="mt-1 text-[11px] leading-tight text-fg-muted">
          {pipLineFor(market.symbol, lot)}
        </p>
      </td>

      <td className="py-3 pr-4 align-top">
        <input
          inputMode="decimal"
          value={profit}
          placeholder={t("noProfitTarget")}
          disabled={pending || !configurable}
          onChange={(e) => setProfit(e.target.value)}
          onBlur={askProfit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="field-input w-28 rounded-md px-2 py-1.5 text-sm tabular-nums"
        />
      </td>

      <td className="py-3">
        <input
          type="checkbox"
          checked={market.enabled}
          disabled={pending || !configurable}
          onChange={(e) => askEnabled(e.target.checked)}
          className="control"
        />
      </td>
    </tr>
  );

  if (!confirming) return row;

  return (
    <>
      {row}
      {/* A row of its own rather than a browser confirm(): it has to show two
          values side by side, and a native dialog can only show a sentence. */}
      <tr className="bg-accent/[0.06]">
        <td colSpan={4} className="px-2 py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <span className="font-mono text-xs">{market.symbol}</span>
            <span className="text-fg-muted">{t(`field.${confirming.what}`)}</span>
            <span className="tabular-nums text-fg-muted line-through">
              {confirming.from}
            </span>
            <span aria-hidden="true" className="text-fg-muted">→</span>
            <span className="tabular-nums font-semibold">{confirming.to}</span>

            <span className="ml-auto flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={confirming.apply}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-[#0A0A0A] disabled:opacity-50"
              >
                {pending ? t("applying") : t("apply")}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={cancel}
                className="rounded-md border border-border px-3 py-1.5 text-xs text-fg-muted hover:text-fg disabled:opacity-50"
              >
                {t("cancel")}
              </button>
            </span>
          </div>
        </td>
      </tr>
    </>
  );
}
