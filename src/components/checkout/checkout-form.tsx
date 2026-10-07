"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import {
  abandonOutstanding,
  startBankTransfer,
  startCryptoInvoice,
  type CheckoutResult,
} from "@/app/(app)/app/checkout/actions";
import { formatUsd, PLANS } from "@/lib/pricing";
import {
  formatNgn,
  formatUsdt,
  QUOTED_USD_NGN_E6,
  usdCentsToMicroUsdt,
  usdCentsToNgnKobo,
} from "@/lib/money";
import { Card } from "@/components/ui";
import { PaymentWatcher } from "@/components/checkout/payment-watcher";

type Method = "alatpay_transfer" | "alatpay_card" | "usdt_trc20";

const METHODS: Method[] = ["alatpay_transfer", "alatpay_card", "usdt_trc20"];


/**
 * A value the payer has to reproduce exactly. Monospace so digits cannot be
 * misread, and a copy button because hand-typing a 34-character TRON address
 * is how money goes somewhere it cannot be recovered from.
 */
function CopyRow({ label, value }: { label: string; value: string }) {
  const t = useTranslations("checkout");
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-3">
      <p className="text-xs uppercase tracking-wide text-fg-muted">{label}</p>
      <div className="mt-1.5 flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm">
          {value}
        </code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(value);
            setCopied(true);
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs hover:border-fg-muted"
        >
          {copied ? (
            <Check className="size-3.5 text-chart-up" aria-hidden="true" />
          ) : (
            <Copy className="size-3.5" aria-hidden="true" />
          )}
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
    </div>
  );
}

/** Codes the server is allowed to surface. Anything else is ours to explain. */
const KNOWN_ERRORS = new Set([
  "bad_term",
  "bad_method",
  "not_configured",
  "not_signed_in",
  "generic",
]);

/** P2-303 — pick duration, see the discount, pick a method, see the total. */
export function CheckoutForm({
  initial = null,
}: {
  initial?: CheckoutResult | null;
}) {
  const t = useTranslations("checkout");

  const [months, setMonths] = useState<number>(1);
  const [method, setMethod] = useState<Method>("alatpay_transfer");
  // Seeded from the server, so an open invoice is on screen in the first
  // frame instead of appearing after a flash of the plan chooser.
  const [result, setResult] = useState<CheckoutResult | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /**
   * Back to the options. Without this, whichever method was picked first
   * holds the page until the invoice expires — so "Renew" showed an old
   * pending payment rather than letting anyone choose.
   */
  function changeMethod() {
    setError(null);
    startTransition(async () => {
      const res = await abandonOutstanding();
      if (res.ok) setResult(null);
      else
        setError(
          res.error === "already_sent" ? t("alreadySent") : t("changeFailed"),
        );
    });
  }

  /**
   * Only translate codes we recognise.
   *
   * The action returns the provider's error text for anything unexpected, and
   * next-intl renders a missing key as the key itself — so a network fault
   * surfaced as "checkout.errors.Failed to parse URL from /bank-transfer/...".
   * That tells an investor nothing and tells an attacker about our plumbing.
   */
  function messageFor(code: string): string {
    return KNOWN_ERRORS.has(code) ? t(`errors.${code}`) : t("errors.generic");
  }

  function start() {
    setError(null);
    startTransition(async () => {
      // The server recalculates the price from `months` alone. Nothing here
      // sends an amount, so nothing here can choose one.
      const res =
        method === "usdt_trc20"
          ? await startCryptoInvoice(months)
          : await startBankTransfer(months, method);

      if (res.ok) setResult(res);
      else setError(messageFor(res.error));
    });
  }

  // Never computed here. The pricing engine is the one source of truth, so
  // this page cannot disagree with what the backend charges.
  const plan = PLANS.find((p) => p.months === months) ?? PLANS[0];
  const paysNaira = method !== "usdt_trc20";

  if (result?.ok && result.kind === "bank_transfer") {
    return (
      <Card className="max-w-lg">
        <h2 className="text-lg font-semibold">{t("transfer.title")}</h2>
        <CopyRow label={t("transfer.account")} value={result.accountNumber} />
        {result.bankName ? (
          <CopyRow label={t("transfer.bank")} value={result.bankName} />
        ) : null}
        <CopyRow
          label={t("transfer.amount")}
          value={formatNgn(result.amountNgn)}
        />
        <p className="mt-5 text-xs leading-relaxed text-fg-muted">
          {t("transfer.note")}
        </p>
        <PaymentWatcher subscriptionId={result.subscriptionId} />
        <button
          type="button"
          onClick={changeMethod}
          disabled={pending}
          className="mt-5 text-sm text-accent underline underline-offset-2 disabled:opacity-60"
        >
          {t("changeMethod")}
        </button>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-chart-down">
            {error}
          </p>
        ) : null}
      </Card>
    );
  }

  if (result?.ok && result.kind === "crypto") {
    return (
      <Card className="max-w-lg">
        <h2 className="text-lg font-semibold">{t("crypto.title")}</h2>
        <CopyRow label={t("crypto.address")} value={result.address} />
        <CopyRow
          label={t("crypto.amount")}
          value={formatUsdt(result.microUsdt)}
        />
        <div className="mt-3">
          <p className="text-xs uppercase tracking-wide text-fg-muted">
            {t("crypto.network")}
          </p>
          <p className="mt-1.5 text-sm font-medium">{t("crypto.networkValue")}</p>
        </div>
        {/* Said loudly: the wrong network or the wrong token means the money
            is gone and we cannot get it back. */}
        <p className="mt-5 rounded-lg border border-chart-down/40 bg-chart-down/10 px-3.5 py-3 text-xs leading-relaxed">
          {t("crypto.note")}
        </p>
        <p className="mt-3 text-xs text-fg-muted">
          {t("crypto.confirmations", { count: result.confirmations })}{" "}
          {t("crypto.expires")}
        </p>
        <PaymentWatcher subscriptionId={result.subscriptionId} />
        <button
          type="button"
          onClick={changeMethod}
          disabled={pending}
          className="mt-5 text-sm text-accent underline underline-offset-2 disabled:opacity-60"
        >
          {t("changeMethod")}
        </button>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-chart-down">
            {error}
          </p>
        ) : null}
      </Card>
    );
  }

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
                      className="control mt-0.5"
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
                    className="control mt-0.5"
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

        <button
          type="button"
          disabled={pending}
          onClick={start}
          className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-[#0A0A0A] shadow-[var(--glow-accent)] transition-all hover:bg-accent-hot disabled:opacity-60 disabled:shadow-none"
        >
          {pending ? t("submitting") : t("submit")}
        </button>

        {error ? (
          <p role="alert" className="mt-3 text-sm text-chart-down">
            {error}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
