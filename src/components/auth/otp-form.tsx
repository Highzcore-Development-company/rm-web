"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { FormError, inputClass, submitClass } from "@/components/auth/auth-card";

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
 * Supabase issues and checks the code; we never generate or store one. Rolling
 * our own would mean hand-writing expiry, rate limiting and constant-time
 * comparison for no gain.
 */
export function OtpForm({ email }: { email: string }) {
  const t = useTranslations("auth.verifyEmail");
  const router = useRouter();

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [verifying, startVerify] = useTransition();
  const [resending, startResend] = useTransition();

  function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startVerify(async () => {
      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: code.trim(),
        // "email" covers both signup confirmation and a later re-verification,
        // so one screen serves both rather than branching on how they arrived.
        type: "email",
      });

      if (verifyError) {
        setError(
          verifyError.code === "otp_expired"
            ? t("errors.expired")
            : t("errors.invalid"),
        );
        return;
      }

      // Verified means a session now exists, so the callback's job — creating
      // the investors row — has not happened. The onboarding page creates it
      // if missing, which is exactly this case.
      router.push("/app/onboarding");
      router.refresh();
    });
  }

  function resend() {
    setResent(false);
    setError(null);
    startResend(async () => {
      const supabase = createClient();
      await supabase.auth.resend({ type: "signup", email });
      // Reported as sent regardless: whether an address has a pending signup
      // is not something this form should confirm to whoever is typing.
      setResent(true);
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
        {resent ? (
          <span className="text-fg-muted">{t("resent")}</span>
        ) : (
          <button
            type="button"
            onClick={resend}
            disabled={resending}
            className="text-accent underline underline-offset-2 disabled:opacity-60"
          >
            {resending ? t("resending") : t("resend")}
          </button>
        )}
      </div>
    </form>
  );
}
