"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { changeAdminPassword } from "@/app/(app)/app/admin/change-password/actions";
import { Field, FormError, inputClass, submitClass } from "@/components/auth/auth-card";
import { useToast } from "@/components/toast";

export function ChangePasswordForm() {
  const t = useTranslations("admin.changePassword");
  const router = useRouter();
  const toast = useToast();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    start(async () => {
      const res = await changeAdminPassword(password, confirm);
      if (!res.ok) {
        setError(t(`errors.${res.error}`));
        return;
      }
      toast.success(t("done"));
      // A full reload, not a push: the layout gate reads the flag server-side,
      // and a client navigation would carry the cached "must change" answer.
      window.location.href = "/app/admin";
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <FormError>{error}</FormError>

      <Field id="password" label={t("password")} hint={t("hint")}>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
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

      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
