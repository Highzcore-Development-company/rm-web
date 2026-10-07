"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Field, FormError, inputClass } from "@/components/auth/auth-card";
import { PasswordField, SubmitButton } from "@/components/auth/fields";

export function LoginForm() {
  const t = useTranslations("auth.login");
  const router = useRouter();
  const params = useSearchParams();

  // The auth callback redirects here with a reason when a link fails, so the
  // user is told what went wrong instead of landing on a bare login form.
  const reason = params.get("error");
  const initialError =
    reason === "link_expired"
      ? t("errors.linkExpired")
      : reason === "missing_code"
        ? t("errors.missingCode")
        : null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setSubmitting(false);
      // Supabase distinguishes an unverified address from a wrong password.
      // Worth surfacing: "wrong password" sends someone to the reset flow for
      // a password that is in fact correct.
      setError(
        signInError.code === "email_not_confirmed"
          ? t("errors.unverified")
          : t("errors.invalid"),
      );
      return;
    }

    const next = params.get("next");
    const safeNext =
      next && next.startsWith("/") && !next.startsWith("//")
        ? next
        : "/app/dashboard";

    router.push(safeNext);
    router.refresh();
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
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
      />

      <SubmitButton pending={submitting} pendingLabel={t("submitting")}>
        {t("submit")}
      </SubmitButton>
    </form>
  );
}
