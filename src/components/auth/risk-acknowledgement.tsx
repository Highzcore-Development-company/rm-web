"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { acknowledgeRisk } from "@/app/(app)/app/risk-acknowledgement/actions";
import { FormError, submitClass } from "@/components/auth/auth-card";

export function RiskAcknowledgement() {
  const t = useTranslations("auth.signup");
  const risk = useTranslations("risk");
  const router = useRouter();

  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!checked) {
      setError(t("errors.acknowledge"));
      return;
    }

    start(async () => {
      const res = await acknowledgeRisk();
      if (!res.ok) {
        setError(t("errors.generic"));
        return;
      }
      router.push("/app/dashboard");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <FormError>{error}</FormError>

      {/* The substance, not just a link to it. Someone who has to leave the
          page to read what they are agreeing to mostly does not. */}
      <div className="space-y-4 rounded-xl border border-border bg-bg p-5 text-sm leading-relaxed text-fg-muted">
        {(["loss", "past", "ai"] as const).map((key) => (
          <div key={key}>
            <p className="font-medium text-fg">{risk(`${key}.title`)}</p>
            <p className="mt-1">{risk(`${key}.body`)}</p>
          </div>
        ))}
      </div>

      <label className="flex gap-3 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="control mt-0.5"
        />
        <span className="leading-relaxed text-fg-muted">{t("acknowledge")}</span>
      </label>

      <Link
        href="/risk-disclosure"
        target="_blank"
        className="inline-block text-sm text-accent underline underline-offset-2"
      >
        {t("acknowledgeLink")}
      </Link>

      <button type="submit" disabled={pending || !checked} className={submitClass}>
        {t("continue")}
      </button>
    </form>
  );
}
