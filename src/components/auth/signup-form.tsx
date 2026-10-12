"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { sendVerificationCode } from "@/app/(app)/app/verify-email/actions";
import { acknowledgeRisk } from "@/app/(app)/app/risk-acknowledgement/actions";
import { Field, FormError, inputClass } from "@/components/auth/form-bits";
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
  /**
   * HS-BOT-v4 §1. Null until they choose — deliberately not defaulted to
   * either. A pre-selected card is a choice made for them, and this is the
   * most consequential thing they decide on the site.
   */
  const [accountType, setAccountType] = useState<"trader" | "investor" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!accountType) {
      setError(t("errors.accountType"));
      return;
    }

    // P2-104 — the risk disclosure is shown during signup and must be
    // acknowledged. Checked here as well as in the markup so the form cannot
    // be submitted past it.
    //
    // INVESTORS ONLY. A trader places their own trades on their own broker;
    // we are not trading their money, so asking them to acknowledge the risk
    // of us doing it would be a record of something that never happens.
    if (accountType === "investor" && !acknowledged) {
      setError(t("errors.acknowledge"));
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("errors.password"));
      return;
    }

    setSubmitting(true);

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Supabase sends this link in the confirmation email. The callback
        // exchanges the code and creates the investors row.
        // Carried on the auth user because the investors row does not exist
        // yet — it is created after verification, and reads this back.
        data: { account_type: accountType },
        // Where they land afterwards depends on which they chose. A trader
        // has no broker account to onboard; an investor cannot finish on
        // their own and goes to the enquiry form.
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${
          accountType === "trader" ? "/app/checkout" : "/app/enquiry"
        }`,
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
    // Supabase sends no mail in this product, so nothing has reached the
    // investor yet. Without this the verify page would sit there asking for a
    // code that was never issued.
    if (data.session) {
      // They ticked the box on this form; recording it here means the gate
      // does not stop and ask them the same question again. A trader never
      // ticked one and is never asked, so there is nothing to record.
      await Promise.all([
        ...(accountType === "investor" ? [acknowledgeRisk()] : []),
        sendVerificationCode(),
      ]);
    }

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

      {/* HS-BOT-v4 §1 — the one question, after email and password and before
          anything else. Two cards rather than a dropdown, because this is the
          most important choice anybody makes on the site and a dropdown makes
          it look like a preference. Radios underneath, so it is one keyboard
          group and a screen reader announces it as a choice. */}
      <fieldset>
        <legend className="text-sm font-medium">{t("choose.legend")}</legend>
        <p className="mt-1 text-xs text-fg-muted">{t("choose.hint")}</p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(["trader", "investor"] as const).map((kind) => {
            const on = accountType === kind;
            return (
              <label
                key={kind}
                className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                  on
                    ? "border-accent bg-accent/[0.06]"
                    : "border-border bg-[var(--input-bg)] hover:border-fg-subtle"
                }`}
              >
                <input
                  type="radio"
                  name="account_type"
                  value={kind}
                  checked={on}
                  onChange={() => setAccountType(kind)}
                  className="sr-only"
                />
                <span className="block text-sm font-semibold">
                  {t(`choose.${kind}.title`)}
                </span>
                <span className="mt-1.5 block text-xs leading-relaxed text-fg-muted">
                  {t(`choose.${kind}.body`)}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {accountType === "investor" && (
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
          className="control mt-0.5"
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
      )}

      <SubmitButton pending={submitting} pendingLabel={t("submitting")}>
        {t("submit")}
      </SubmitButton>
    </form>
  );
}
