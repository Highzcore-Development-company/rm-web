"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  sendVerificationCode,
  verifyCode,
} from "@/app/(app)/app/verify-email/actions";
import { FormError, inputClass, submitClass } from "@/components/auth/form-bits";
import { useToast } from "@/components/toast";

const CODE_LENGTH = 6;

/**
 * P2-106 — email verification by code rather than link.
 *
 * A code beats a magic link here for a reason that matters on a trading
 * product: people sign up on a phone and read mail in an app that opens links
 * in its own in-app browser, which is a different session from the one they
 * started in. The link then signs them in somewhere they cannot see, and they
 * come back to the original tab still logged out. A code is typed into the tab
 * they are already in.
 *
 * WE issue and check the code, and nodemailer delivers it over our own SMTP.
 * Supabase sends no mail in this product. That means expiry, attempt limits,
 * resend cooldown and constant-time comparison are ours to get right — see
 * lib/verification.ts and the verify-email actions.
 */
export function OtpForm({ email }: { email: string }) {
  void email; // shown by the page; the action reads the session instead
  const t = useTranslations("auth.verifyEmail");
  const router = useRouter();
  const toast = useToast();

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, startVerify] = useTransition();
  const [resending, startResend] = useTransition();

  function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startVerify(async () => {
      const res = await verifyCode(code);

      if (!res.ok) {
        setError(t(`errors.${res.error}`));
        return;
      }

      router.push("/app/dashboard");
      router.refresh();
    });
  }

  function resend() {
    setError(null);
    startResend(async () => {
      const res = await sendVerificationCode();
      // A toast rather than inline text: the confirmation used to replace the
      // link that triggered it, so the control vanished and the message
      // appeared where nobody was looking.
      if (res.ok) toast.success(t("resent"));
      else toast.error(t(`errors.${res.error}`));
    });
  }

  return (
    <form onSubmit={verify} className="space-y-5">
      <FormError>{error}</FormError>

      <div>
        <label htmlFor="code" className="block text-sm font-medium">
          {t("code")}
        </label>
        <input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          maxLength={CODE_LENGTH}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className={`${inputClass} text-center font-mono text-2xl tracking-[0.4em]`}
          placeholder="000000"
        />
      </div>

      <button
        type="submit"
        disabled={verifying || code.length !== CODE_LENGTH}
        className={submitClass}
      >
        {verifying ? t("verifying") : t("verify")}
      </button>

      <div className="text-center text-sm">
        <button
          type="button"
          onClick={resend}
          disabled={resending}
          className="text-accent underline underline-offset-2 disabled:opacity-60"
        >
          {resending ? t("resending") : t("resend")}
        </button>
      </div>
    </form>
  );
}
