"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { recheckPayment } from "@/app/(app)/app/admin/(panel)/billing/actions";
import { useToast } from "@/components/toast";

export function RecheckButton({ subscriptionId }: { subscriptionId: string }) {
  const t = useTranslations("adminBilling");
  const toast = useToast();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        start(async () => {
          const res = await recheckPayment(subscriptionId);
          // Three outcomes, three messages. "Checked — still nothing" is the
          // useful one: it is the difference between "we missed it" and "they
          // have not actually paid", which is the whole question being asked.
          if (!res.ok) toast.error(t("checkFailed"));
          else if (res.paid) toast.success(t("checkedPaid"));
          else toast.success(t("checked"));
        });
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:text-fg disabled:opacity-60"
    >
      <RefreshCw
        className={`size-3 ${pending ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      {t("checkNow")}
    </button>
  );
}
