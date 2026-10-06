"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatUsd, PLANS } from "@/lib/pricing";
import {
  formatNgn,
  formatUsdt,
  QUOTED_USD_NGN_E6,
  usdCentsToMicroUsdt,
  usdCentsToNgnKobo,
} from "@/lib/money";
import { Card } from "@/components/ui";

type Method = "alatpay_transfer" | "alatpay_card" | "usdt_trc20";

const METHODS: Method[] = ["alatpay_transfer", "alatpay_card", "usdt_trc20"];

/** P2-303 — pick duration, see the discount, pick a method, see the total. */
export function CheckoutForm() {
  const t = useTranslations("checkout");

  const [months, setMonths] = useState<number>(1);
  const [method, setMethod] = useState<Method>("alatpay_transfer");

  // Never computed here. The pricing engine is the one source of truth, so
  // this page cannot disagree with what the backend charges.
  const plan = PLANS.find((p) => p.months === months) ?? PLANS[0];
  const paysNaira = method !== "usdt_trc20";

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-8">
        <fieldset>
          <legend className="text-sm font-semibold">{t("term.legend")}</legend>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {PLANS.map((p) => {
              const selected = p.months === months;
              return (
                <label
                  key={p.months}
                  className={`flex cursor-pointer items-start justify-between gap-4 rounded-lg border p-4 transition-colors ${
                    selected
                      ? "border-accent bg-accent/5"
                      : "border-border bg-surface hover:border-fg-muted"
                  }`}
                >
                  <span className="flex gap-3">
                    <input
                      type="radio"
                      name="months"
                      value={p.months}
                      checked={selected}
                      onChange={() => setMonths(p.months)}
                      className="mt-1 size-4 accent-[#FFB020]"
                    />
                    <span>
                      <span className="block text-sm font-medium">
                        {p.months === 1
                          ? t("term.one")
                          : t("term.other", { months: p.months })}
                      </span>
                      <span className="mt-1 block text-xs text-fg-muted">
                        {t("term.perMonth", {
                          price: formatUsd(p.perMonthCents),
                        })}
                      </span>
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold tabular-nums">
                      {formatUsd(p.totalCents)}
                    </span>
                    {p.discountCents > 0 ? (
                      <span className="mt-1 block text-xs text-accent">
                        {t("term.save", {
                          amount: formatUsd(p.discountCents),
                        })}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold">{t("method.legend")}</legend>
          <div className="mt-4 space-y-3">
            {METHODS.map((m) => {
              const selected = m === method;
              return (
                <label
                  key={m}
                  className={`flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors ${
                    selected
                      ? "border-accent bg-accent/5"
                      : "border-border bg-surface hover:border-fg-muted"
                  }`}
                >
                  <input
                    type="radio"
                    name="method"
                    value={m}
                    checked={selected}
                    onChange={() => setMethod(m)}
                    className="mt-1 size-4 accent-[#FFB020]"
                  />
                  <span>
                    <span className="block text-sm font-medium">
                      {t(`method.${m}`)}
                    </span>
                    <span className="mt-1 block text-xs text-fg-muted">
                      {t(`method.${m}Hint`)}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>

      {/* The total is visible the whole time, not revealed at the last step. */}
      <Card className="h-fit lg:sticky lg:top-24">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-fg-muted">{t("total.subtotal")}</dt>
            <dd className="tabular-nums">{formatUsd(plan.subtotalCents)}</dd>
          </div>
          {plan.discountCents > 0 ? (
            <div className="flex justify-between">
              <dt className="text-fg-muted">{t("total.discount")}</dt>
              <dd className="tabular-nums text-accent">
                −{formatUsd(plan.discountCents)}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-border pt-3 text-base font-semibold">
            <dt>{t("total.label")}</dt>
            <dd className="tabular-nums">{formatUsd(plan.totalCents)}</dd>
          </div>
        </dl>

        <p className="mt-4 text-xs leading-relaxed text-fg-muted">
          {paysNaira ? (
            <>
              {formatNgn(
                usdCentsToNgnKobo(plan.totalCents, QUOTED_USD_NGN_E6),
              )}{" "}
              —{" "}
              {t("total.ngnNote", {
                rate: formatNgn((QUOTED_USD_NGN_E6 / 1_000_000) * 100),
              })}
            </>
          ) : (
            <>
              {formatUsdt(usdCentsToMicroUsdt(plan.totalCents))} —{" "}
              {t("total.usdtNote")}
            </>
          )}
        </p>

        {/* Honest disabled state. The pricing, the terms and the totals are
            real; the provider accounts are not connected yet (P2-304/305/306),
            so there is nothing to hand the money to. */}
        <button
          type="button"
          disabled
          className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-accent px-5 py-3 text-sm font-semibold text-[#0A0A0A] disabled:opacity-50"
        >
          {t("submit")}
        </button>
        <p role="note" className="mt-3 text-xs leading-relaxed text-fg-muted">
          {t("unavailable")}
        </p>
      </Card>
    </div>
  );
}
