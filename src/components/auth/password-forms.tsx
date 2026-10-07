"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import {
  Field,
  FormError,
  inputClass,
  submitClass,
} from "@/components/auth/auth-card";

const MIN_PASSWORD_LENGTH = 8;

export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgotPassword");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/app/reset-password`,
    });

    // Always report success, whatever happened. Saying "no account with that
    // email" turns this form into a way to find out who has an account here.
    setSubmitting(false);
    setSent(true);
  }

  if (sent) {
    return <p className="text-sm leading-relaxed text-fg-muted">{t("sent")}</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
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

      <button type="submit" disabled={submitting} className={submitClass}>
        {submitting ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}

export function ResetPasswordForm() {
  const t = useTranslations("auth.resetPassword");
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("errors.password"));
      return;
    }
    if (password !== confirm) {
      setError(t("errors.mismatch"));
      return;
    }

    setSubmitting(true);

    // Works because the callback already exchanged the recovery code for a
    // session. Without that session this call has nothing to update.
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setSubmitting(false);
      setError(t("errors.generic"));
      return;
    }

    router.push("/app/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <FormError>{error}</FormError>

      <Field id="password" label={t("password")}>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field id="confirm" label={t("confirm")}>
        <input
          id="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputClass}
        />
      </Field>

      <button type="submit" disabled={submitting} className={submitClass}>
        {submitting ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
