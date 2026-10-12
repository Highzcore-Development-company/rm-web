"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { submitEnquiry } from "@/app/(app)/app/enquiry/actions";

/**
 * The investor enquiry.
 *
 * On success it does NOT route anywhere. There is nowhere to go: the next
 * step is a person calling them, and a "continue" button would imply the
 * account is being set up right now. It says what happens next and stops.
 */
export function EnquiryForm() {
  const t = useTranslations("enquiry.form");
  const [pending, start] = useTransition();
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sent) {
    return (
      <div
        role="status"
        className="rounded-xl border border-accent/40 bg-accent/[0.06] p-5"
      >
        <p className="text-sm font-medium">{t("sentTitle")}</p>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">
          {t("sentBody")}
        </p>
      </div>
    );
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await submitEnquiry(phone, note);
          if (res.ok) setSent(true);
          else setError(t(`errors.${res.error}`));
        });
      }}
    >
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-chart-down/50 bg-chart-down/10 px-4 py-3 text-sm"
        >
          {error}
        </p>
      )}

      <label className="block text-sm">
        {t("phone")}
        <input
          type="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="field-input mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm"
        />
      </label>

      <label className="block text-sm">
        {t("note")}
        <span className="mt-0.5 block text-xs text-fg-muted">
          {t("noteHint")}
        </span>
        <textarea
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="field-input mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot disabled:opacity-50"
      >
        {pending ? t("sending") : t("submit")}
      </button>
    </form>
  );
}
