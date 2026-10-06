"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { confirmLink, rejectLink } from "@/app/(app)/app/admin/links/actions";

export function LinkActions({ investorId }: { investorId: string }) {
  const t = useTranslations("adminLinks");
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function run(action: (id: string) => Promise<{ ok: boolean }>) {
    setFailed(false);
    startTransition(async () => {
      const res = await action(investorId);
      if (!res.ok) setFailed(true);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => run(confirmLink)}
        className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-[#0A0A0A] disabled:opacity-60"
      >
        {t("confirm")}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(rejectLink)}
        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-fg-muted hover:text-fg disabled:opacity-60"
      >
        {t("reject")}
      </button>
      {failed ? (
        <span role="alert" className="text-xs text-chart-down">
          !
        </span>
      ) : null}
    </div>
  );
}
