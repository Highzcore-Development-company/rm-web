"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Clock3 } from "lucide-react";
import {
  claimAccount,
  type ActionResult,
} from "@/app/(app)/app/link-account/actions";
import { useToast } from "@/components/toast";
import {
  Field,
  FormError,
  inputClass,
  submitClass,
} from "@/components/auth/auth-card";

export function ClaimForm({ initialLogin }: { initialLogin: string | null }) {
  const t = useTranslations("linkAccount.claim");

  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(claimAccount, null);

  // Opens the form again for someone who mistyped. Starts closed when a number
  // is already on file: leaving a live submit button under a submitted claim
  // invites double-submits and makes it look like nothing happened.
  const [editing, setEditing] = useState(false);

  // useActionState gives the result as state rather than a callback, so the
  // toast fires on the transition into a successful state. The ref stops a
  // re-render raising the same one twice.
  const toast = useToast();
  const announced = useRef(false);

  useEffect(() => {
    if (state?.ok && !announced.current) {
      announced.current = true;
      setEditing(false);
      toast.success(t("saved"));
    }
    if (state && !state.ok) announced.current = false;
  }, [state, toast, t]);

  const errorKey = state && !state.ok ? state.error : null;
  const submitted = Boolean(initialLogin) && !editing;

  if (submitted) {
    return (
      <div className="mt-6 max-w-sm">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-bg px-4 py-3">
          <Clock3
            className="mt-0.5 size-4 shrink-0 text-accent"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium">{t("submitted")}</p>
            <p className="mt-1 font-mono text-sm text-fg-muted">
              {initialLogin}
            </p>
          </div>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          {t("pending")}
        </p>

        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-3 text-sm text-accent underline underline-offset-2"
        >
          {t("change")}
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 max-w-sm space-y-5">
      {errorKey ? <FormError>{t(`errors.${errorKey}`)}</FormError> : null}

      <Field id="vantage_account_id" label={t("label")}>
        <input
          id="vantage_account_id"
          name="vantage_account_id"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          required
          defaultValue={initialLogin ?? ""}
          className={inputClass}
        />
      </Field>

      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
