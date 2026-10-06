"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { requestDisconnect } from "@/app/(app)/app/link-account/actions";

export function DisconnectButton() {
  const t = useTranslations("linkAccount.disconnect");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<"done" | "error" | null>(null);

  function onClick() {
    // Deliberately a blocking confirm. This stops trading on a real account,
    // and an accidental click should not be able to do that silently.
    if (!window.confirm(t("confirm"))) return;

    startTransition(async () => {
      const res = await requestDisconnect();
      setResult(res.ok ? "done" : "error");
    });
  }

  if (result === "done") {
    return (
      <p role="status" className="mt-4 text-sm text-fg">
        {t("done")}
      </p>
    );
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded-md border border-chart-down/50 px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:border-chart-down disabled:opacity-60"
      >
        {t("cta")}
      </button>
      {result === "error" ? (
        <p role="alert" className="mt-3 text-sm text-fg-muted">
          {t("error")}
        </p>
      ) : null}
    </div>
  );
}
