"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { claimAccount, type ActionResult } from "@/app/(app)/app/link-account/actions";
import { Field, FormError, inputClass, submitClass } from "@/components/auth/auth-card";

export function ClaimForm({ initialLogin }: { initialLogin: string | null }) {
  const t = useTranslations("linkAccount.claim");

  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(claimAccount, null);

  const errorKey = state && !state.ok ? state.error : null;

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
