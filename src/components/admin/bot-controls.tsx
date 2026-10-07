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
import { useToast } from "@/components/toast";

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

  function commitLot() {
    const value = Number(lot);
    if (lot === (market.lotSize?.toString() ?? "")) return;

    start(async () => {
      const res = await setLotSize(market.symbol, value);
      if (res.ok) {
        // Says what will happen next, because it is not instant: the bot
        // checks the value against the broker and may snap it within a minute.
        toast.success(t("saved.lot", { symbol: market.symbol }));
        router.refresh();
      } else {
        toast.error(t(`errors.${res.error}`));
        setLot(market.lotSize?.toString() ?? "");
      }
    });
  }

  function commitProfit() {
    if (profit === (market.closeAtProfit?.toString() ?? "")) return;
    const value = profit.trim() === "" ? null : Number(profit);

    start(async () => {
      const res = await setCloseAtProfit(market.symbol, value);
      if (res.ok) {
        toast.success(t("saved.profit", { symbol: market.symbol }));
        router.refresh();
      } else {
        toast.error(t(`errors.${res.error}`));
        setProfit(market.closeAtProfit?.toString() ?? "");
      }
    });
  }

  return (
    <tr className={market.enabled ? undefined : "opacity-50"}>
      <th scope="row" className="py-3 pr-4 font-mono text-xs font-normal">
        {market.symbol}
      </th>

      <td className="py-3 pr-4">
        <input
          inputMode="decimal"
          value={lot}
          disabled={pending || !configurable}
          onChange={(e) => setLot(e.target.value)}
          // Committed on blur and on Enter, not per keystroke: every keystroke
          // would be a write to the bot's database.
          onBlur={commitLot}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="field-input w-24 rounded-md px-2 py-1.5 text-sm tabular-nums"
        />
      </td>

      <td className="py-3 pr-4">
        <input
          inputMode="decimal"
          value={profit}
          placeholder={t("noProfitTarget")}
          disabled={pending || !configurable}
          onChange={(e) => setProfit(e.target.value)}
          onBlur={commitProfit}
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
          onChange={(e) => {
            const next = e.target.checked;
            start(async () => {
              const res = await setMarketEnabled(market.symbol, next);
              if (res.ok) {
                toast.success(
                  next
                    ? t("saved.enabled", { symbol: market.symbol })
                    : t("saved.disabled", { symbol: market.symbol }),
                );
                router.refresh();
              } else toast.error(t(`errors.${res.error}`));
            });
          }}
          className="control"
        />
      </td>
    </tr>
  );
}
