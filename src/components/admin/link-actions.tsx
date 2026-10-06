"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import { confirmLink, rejectLink } from "@/app/(app)/app/admin/links/actions";
import { useToast } from "@/components/toast";

export function LinkActions({ investorId }: { investorId: string }) {
  const t = useTranslations("adminLinks");
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  /**
   * Confirming sends the investor an email, so the result needs to be visible
   * — the row simply vanishing from the queue is ambiguous between "done" and
   * "something went wrong and it reloaded".
   */
  function run(
    action: (id: string) => Promise<{ ok: boolean }>,
    successMessage: string,
  ) {
    startTransition(async () => {
      const res = await action(investorId);
      if (res.ok) toast.success(successMessage);
      else toast.error(t("failed"));
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => run(confirmLink, t("confirmed"))}
        className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot disabled:opacity-60"
      >
        <Check className="size-3.5" aria-hidden="true" />
        {t("confirm")}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(rejectLink, t("rejected"))}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:text-fg disabled:opacity-60"
      >
        <X className="size-3.5" aria-hidden="true" />
        {t("reject")}
      </button>
    </div>
  );
}
