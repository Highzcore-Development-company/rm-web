"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  createApiKey,
  revokeApiKey,
  type CreateKeyResult,
} from "@/app/(app)/app/developer/actions";
import { Field, FormError, inputClass, submitClass } from "@/components/auth/form-bits";

export type KeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

function day(value: string | null) {
  return value ? new Date(value).toLocaleDateString("en-GB") : null;
}

export function KeyManager({ keys }: { keys: KeyRow[] }) {
  const t = useTranslations("developer.keys");
  const [state, formAction, pending] = useActionState<
    CreateKeyResult | null,
    FormData
  >(createApiKey, null);
  const [revoking, startRevoke] = useTransition();

  const errorKey = state && !state.ok ? state.error : null;
  const created = state && state.ok ? state.plaintext : null;

  return (
    <div>
      {/* Shown once, immediately after creation, and deliberately not stored
          anywhere we could re-render it from. */}
      {created ? <KeyRevealed plaintext={created} note={t("shownOnce")} /> : null}

      <form action={formAction} className="mt-6 flex flex-wrap items-end gap-3">
        {errorKey ? (
          <div className="w-full">
            <FormError>{t(`errors.${errorKey}`)}</FormError>
          </div>
        ) : null}

        <div className="min-w-[14rem] flex-1">
          <Field id="name" label={t("name")}>
            <input
              id="name"
              name="name"
              type="text"
              required
              placeholder={t("namePlaceholder")}
              className={inputClass}
            />
          </Field>
        </div>
        <button type="submit" disabled={pending} className={`${submitClass} w-auto`}>
          {pending ? t("creating") : t("create")}
        </button>
      </form>

      {keys.length === 0 ? (
        <p className="mt-8 text-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
                <th scope="col" className="py-2 pr-4 font-medium">{t("name")}</th>
                <th scope="col" className="py-2 pr-4 font-medium">{t("prefix")}</th>
                <th scope="col" className="py-2 pr-4 font-medium">{t("created")}</th>
                <th scope="col" className="py-2 pr-4 font-medium">{t("lastUsed")}</th>
                <th scope="col" className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {keys.map((k) => (
                <tr key={k.id} className={k.revoked_at ? "opacity-50" : undefined}>
                  <th scope="row" className="py-3 pr-4 font-normal">{k.name}</th>
                  <td className="py-3 pr-4 font-mono text-xs">{k.key_prefix}…</td>
                  <td className="py-3 pr-4 text-fg-muted">{day(k.created_at)}</td>
                  <td className="py-3 pr-4 text-fg-muted">
                    {day(k.last_used_at) ?? t("never")}
                  </td>
                  <td className="py-3">
                    {k.revoked_at ? (
                      <span className="text-xs text-fg-muted">{t("revoked")}</span>
                    ) : (
                      <button
                        type="button"
                        disabled={revoking}
                        onClick={() => startRevoke(() => void revokeApiKey(k.id))}
                        className="rounded-md border border-border px-3 py-1.5 text-xs text-fg-muted hover:text-fg disabled:opacity-60"
                      >
                        {t("revoke")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function KeyRevealed({ plaintext, note }: { plaintext: string; note: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div
      role="alert"
      className="rounded-md border border-accent/50 bg-accent/5 p-4"
    >
      <p className="text-sm font-medium">{note}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <code className="break-all rounded bg-bg px-3 py-2 font-mono text-xs">
          {plaintext}
        </code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(plaintext);
            setCopied(true);
          }}
          className="rounded-md border border-border px-3 py-1.5 text-xs hover:border-fg-muted"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
