"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Undo2 } from "lucide-react";
import { recordRefund } from "@/app/(app)/app/admin/(panel)/billing/actions";
import { useToast } from "@/components/toast";

/**
 * Record a refund that has ALREADY been paid out by hand.
 *
 * Worded throughout as recording, never as refunding, because pressing this
 * sends nobody any money. An admin who reads it as "refund this payment" will
 * tick it and leave the investor waiting on a transfer that never comes.
 *
 * Defaults to the full amount, which is the common case, and is editable for
 * a partial.
 */
export function RefundButton({
  subscriptionId,
  amountUsd,
  refundedUsd,
}: {
  subscriptionId: string;
  amountUsd: number;
  refundedUsd: number | null;
}) {
  const t = useTranslations("adminBilling.refund");
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  // Shown in whole dollars; converted to cents on the way out. Money is
  // integer minor units everywhere behind this input.
  const [amount, setAmount] = useState((amountUsd / 100).toFixed(2));
  const [reason, setReason] = useState("");

  if (refundedUsd != null) {
    return (
      <span className="text-xs text-fg-muted">
        {t("already", { amount: (refundedUsd / 100).toFixed(2) })}
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
      >
        <Undo2 className="size-3.5" aria-hidden="true" />
        {t("open")}
      </button>
    );
  }

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const cents = Math.round(Number(amount) * 100);
        start(async () => {
          const res = await recordRefund(subscriptionId, cents, reason);
          if (res.ok) {
            toast.success(t("recorded"));
            setOpen(false);
            router.refresh();
          } else toast.error(t(`errors.${res.error}`));
        });
      }}
    >
      <label className="text-xs text-fg-muted">
        {t("amount")}
        <input
          inputMode="decimal"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="field-input mt-1 block w-24 rounded-md px-2 py-1.5 text-sm tabular-nums"
        />
      </label>
      <label className="flex-1 basis-48 text-xs text-fg-muted">
        {t("reason")}
        <input
          required
          minLength={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="field-input mt-1 block w-full rounded-md px-2 py-1.5 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-chart-down/50 px-3 py-1.5 text-xs font-medium transition-colors hover:border-chart-down disabled:opacity-50"
      >
        {t("save")}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="px-2 py-1.5 text-xs text-fg-muted hover:text-fg"
      >
        {t("cancel")}
      </button>
    </form>
  );
}
