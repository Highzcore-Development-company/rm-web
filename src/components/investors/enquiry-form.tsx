"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { Field, FormError, inputClass, submitClass } from "@/components/auth/form-bits";
import { submitEnquiry, type EnquiryResult } from "@/app/(marketing)/investors/actions";

/**
 * The managed-trading enquiry form.
 *
 * Four fields and a message. Every extra question here is one more reason to
 * close the tab, and anything we actually need — account size, broker, what
 * they trade — is a better question on the call than in a box.
 *
 * Only name, email and a message are required. Business and phone help us
 * prepare, but a prospect who will not give a phone number before they have
 * spoken to anyone is still a prospect.
 */
export function EnquiryForm() {
  const t = useTranslations("investors.form");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<EnquiryResult | null>(null);

  if (result?.ok) {
    return (
      <div
        // Announced, because the form it replaces is gone and a screen reader
        // would otherwise be told nothing happened.
        role="status"
        className="surface-raised flex flex-col items-center gap-3 rounded-2xl border border-border p-8 text-center"
      >
        <CheckCircle2 className="size-8 text-chart-up" aria-hidden="true" />
        <h2 className="text-lg font-semibold">{t("sent.title")}</h2>
        <p className="max-w-sm text-sm text-fg-muted">{t("sent.body")}</p>
      </div>
    );
  }

  const error = result && !result.ok ? result.error : null;

  return (
    <form
      action={(formData) => start(async () => setResult(await submitEnquiry(formData)))}
      className="space-y-5"
    >
      {error ? <FormError>{t(`error.${error}`)}</FormError> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="name" label={t("name")}>
          <input id="name" name="name" required maxLength={120} className={inputClass} />
        </Field>
        <Field id="email" label={t("email")}>
          <input
            id="email"
            name="email"
            type="email"
            required
            maxLength={160}
            className={inputClass}
          />
        </Field>
        <Field id="company" label={t("company")} hint={t("optional")}>
          <input id="company" name="company" maxLength={160} className={inputClass} />
        </Field>
        <Field id="phone" label={t("phone")} hint={t("optional")}>
          <input id="phone" name="phone" maxLength={40} className={inputClass} />
        </Field>
      </div>

      <Field id="message" label={t("message")} hint={t("messageHint")}>
        <textarea
          id="message"
          name="message"
          required
          rows={6}
          maxLength={4000}
          className={inputClass}
        />
      </Field>

      {/* A honeypot. Hidden from people, irresistible to bots, and the server
          drops anything that fills it. aria-hidden and tabIndex keep it away
          from screen readers and the keyboard, so it traps only automation. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? t("sending") : t("submit")}
      </button>

      <p className="text-center text-xs text-fg-subtle">{t("privacy")}</p>
    </form>
  );
}
