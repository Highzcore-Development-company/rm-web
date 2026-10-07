"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/toast";
import {
  saveNotificationPreferences,
  type SwitchKey,
} from "@/app/(app)/app/account/actions";

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
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function onChange(form: HTMLFormElement) {
    const data = new FormData(form);
    startTransition(async () => {
      const res = await saveNotificationPreferences(data);
      if (res.ok) toast.success(t("saved"));
      else toast.error(t("error"));
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
            className="control"
          />
          {t(key)}
        </label>
      ))}

      <p className="text-xs leading-relaxed text-fg-muted">{t("always")}</p>
    </form>
  );
}
