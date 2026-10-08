"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Field, inputClass, submitClass } from "@/components/auth/form-bits";

/**
 * A password field you can read back.
 *
 * Mistyping a password you cannot see is the most common reason a sign-in
 * fails, and on a phone keyboard it is close to routine. The toggle is purely
 * a display control — the input keeps its name, autocomplete and validation,
 * so password managers and the submit handler see no difference.
 */
export function PasswordField({
  id,
  label,
  hint,
  value,
  onChange,
  autoComplete,
  minLength,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  minLength?: number;
  /** Rendered under the input — the strength meter on signup. */
  children?: React.ReactNode;
}) {
  const t = useTranslations("auth");
  const [visible, setVisible] = useState(false);

  return (
    <Field id={id} label={label} hint={hint}>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} pr-12`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          // Inside a <form>, a button with no explicit type submits it. This
          // one must never do that.
          aria-label={visible ? t("hidePassword") : t("showPassword")}
          aria-pressed={visible}
          className="absolute right-1 top-2 flex size-10 items-center justify-center rounded-md text-fg-muted transition-colors hover:text-fg"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
      {children}
    </Field>
  );
}

/**
 * Advisory only. The rule that actually gates submission is the 8-character
 * minimum enforced in the form, unchanged — this just stops "at least 8
 * characters" being the only feedback someone gets while choosing one.
 */
function score(password: string): number {
  if (!password) return 0;
  let n = 0;
  if (password.length >= 8) n += 1;
  if (password.length >= 12) n += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) n += 1;
  if (/\d/.test(password) || /[^\w\s]/.test(password)) n += 1;
  return Math.min(n, 4);
}

export function PasswordStrength({ password }: { password: string }) {
  const t = useTranslations("auth.strength");
  const id = useId();
  const n = score(password);

  if (!password) return null;

  const labels = ["weak", "weak", "fair", "good", "strong"] as const;
  const colours = [
    "bg-chart-down",
    "bg-chart-down",
    "bg-accent-hot",
    "bg-accent",
    "bg-chart-up",
  ];

  return (
    <div className="mt-3">
      <div className="flex gap-1.5" aria-hidden="true">
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              step <= n ? colours[n] : "bg-border"
            }`}
          />
        ))}
      </div>
      {/* The bars are decorative; this line is what a screen reader gets. */}
      <p id={id} aria-live="polite" className="mt-2 text-xs text-fg-muted">
        {t("label")}: {t(labels[n])}
      </p>
    </div>
  );
}

/**
 * The submit button, with the pending state built in. A form that looks
 * identical before and after you press it gets pressed twice.
 */
export function SubmitButton({
  pending,
  children,
  pendingLabel,
}: {
  pending: boolean;
  children: React.ReactNode;
  pendingLabel: string;
}) {
  return (
    <button type="submit" disabled={pending} className={submitClass}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
