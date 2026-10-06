"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { markDetached } from "@/app/(app)/app/admin/billing/actions";

export function DetachButton({ investorId }: { investorId: string }) {
  const t = useTranslations("adminBilling");
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        setFailed(false);
        start(async () => {
          const res = await markDetached(investorId);
          if (!res.ok) setFailed(true);
        });
      }}
      className={`rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-60 ${
        failed ? "border-chart-down text-chart-down" : "border-border text-fg-muted hover:text-fg"
      }`}
    >
      {t("markDetached")}
    </button>
  );
}
