"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Field, FormError, inputClass } from "@/components/auth/auth-card";
import {
  PasswordField,
  PasswordStrength,
  SubmitButton,
} from "@/components/auth/fields";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Supabase's own error strings are written for developers. "email rate limit
 * exceeded" tells an investor nothing about what to do, and surfacing it
 * verbatim makes our own infrastructure problem look like their mistake.
 *
 * Anything unrecognised falls through to the generic message rather than being
 * shown raw — an unknown error is exactly the case where the wording is least
 * likely to make sense to a person.
 */
function messageFor(
  code: string | undefined,
  t: (key: string) => string,
): string {
  switch (code) {
    case "over_email_send_rate_limit":
      // Ours, not theirs: the built-in sender is throttled until SMTP is
      // configured. Says "wait and retry" because that is what actually works.
      return t("errors.rate_limited");
    case "email_address_invalid":
      return t("errors.email_invalid");
    case "user_already_exists":
    case "email_exists":
      return t("errors.already_registered");
    case "weak_password":
      return t("errors.password");
    // Configuration, not the investor's fault — the email provider is off in
    // Supabase, or signups are closed. Both produce a dead form with nothing
    // on screen explaining it, which is the worst version of this bug.
    case "email_provider_disabled":
      return t("errors.provider_disabled");
    case "signup_disabled":
      return t("errors.signup_disabled");
    default:
      return t("errors.generic");
  }
}

export function SignupForm() {
  const t = useTranslations("auth.signup");
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // P2-104 — the risk disclosure is shown during signup and must be
    // acknowledged. Checked here as well as in the markup so the form cannot
    // be submitted past it.
    if (!acknowledged) {
      setError(t("errors.acknowledge"));
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("errors.password"));
      return;
    }

    setSubmitting(true);

    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Supabase sends this link in the confirmation email. The callback
        // exchanges the code and creates the investors row.
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/app/onboarding`,
      },
    });

    if (signUpError) {
      setSubmitting(false);
      setError(messageFor(signUpError.code, t));
      return;
    }

    // No investors row yet, and no session. "Email verification required
    // before anything else" (P2-106) means exactly that — the row is created
    // by the callback, after the address is confirmed.
    router.push(`/app/verify-email?email=${encodeURIComponent(email)}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <FormError>{error}</FormError>

      <Field id="email" label={t("email")}>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </Field>

      <PasswordField
        id="password"
        label={t("password")}
        hint={t("passwordHint")}
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
      >
        <PasswordStrength password={password} />
      </PasswordField>

      <div
        className={`flex gap-3 rounded-lg border p-4 transition-colors ${
          acknowledged
            ? "border-accent/40 bg-accent/[0.06]"
            : "border-border bg-[var(--input-bg)]"
        }`}
      >
        <input
          id="acknowledge"
          name="acknowledge"
          type="checkbox"
          required
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[#FFB020]"
        />
        <div className="text-sm">
          <label htmlFor="acknowledge" className="leading-relaxed text-fg-muted">
            {t("acknowledge")}
          </label>
          <Link
            href="/risk-disclosure"
            target="_blank"
            className="mt-2 block text-accent underline underline-offset-2"
          >
            {t("acknowledgeLink")}
          </Link>
        </div>
      </div>

      <SubmitButton pending={submitting} pendingLabel={t("submitting")}>
        {t("submit")}
      </SubmitButton>
    </form>
  );
}
