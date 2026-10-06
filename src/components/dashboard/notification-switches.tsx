"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  saveNotificationPreferences,
  type SwitchKey,
} from "@/app/(app)/app/dashboard/actions";

const SWITCHES: SwitchKey[] = [
  "trade_opened",
  "trade_closed",
  "subscription_expiring",
  "bot_switched_off",
];

export function NotificationSwitches({
  initial,
}: {
  initial: Record<SwitchKey, boolean>;
}) {
  const t = useTranslations("dashboard.notifications");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<"saved" | "error" | null>(null);

  function onChange(form: HTMLFormElement) {
    setResult(null);
    const data = new FormData(form);
    startTransition(async () => {
      const res = await saveNotificationPreferences(data);
      setResult(res.ok ? "saved" : "error");
    });
  }

  return (
    <form
      // Saves on toggle. A separate Save button on four checkboxes is a step
      // people forget, and the cost of forgetting is silently not being told
      // the bot stopped.
      onChange={(e) => onChange(e.currentTarget)}
      className="mt-4 space-y-3"
    >
      <p className="text-sm text-fg-muted">{t("subtitle")}</p>

      {SWITCHES.map((key) => (
        <label key={key} className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            name={key}
            defaultChecked={initial[key]}
            disabled={pending}
            className="size-4 accent-[#FFB020]"
          />
          {t(key)}
        </label>
      ))}

      <p aria-live="polite" className="min-h-5 text-xs text-fg-muted">
        {result === "saved" ? t("saved") : result === "error" ? t("error") : ""}
      </p>

      <p className="text-xs leading-relaxed text-fg-muted">{t("always")}</p>
    </form>
  );
}
