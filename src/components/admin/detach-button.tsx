"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { markDetached } from "@/app/(app)/app/admin/billing/actions";
import { useToast } from "@/components/toast";

export function DetachButton({ investorId }: { investorId: string }) {
  const t = useTranslations("adminBilling");
  const toast = useToast();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        start(async () => {
          const res = await markDetached(investorId);
          // The reminder rides in the confirmation because this only records
          // our side — the Vantage step is still theirs to do.
          if (res.ok) toast.success(t("detached"));
          else toast.error(t("detachFailed"));
        });
      }}
      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:text-fg disabled:opacity-60"
    >
      {t("markDetached")}
    </button>
  );
}
