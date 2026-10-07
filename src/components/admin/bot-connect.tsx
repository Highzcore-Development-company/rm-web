"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { KeyRound, Unplug } from "lucide-react";
import {
  connectToBot,
  disconnectFromBot,
} from "@/app/(app)/app/admin/(panel)/bot/actions";
import { useToast } from "@/components/toast";

/**
 * Sign in to the bot's project as yourself.
 *
 * Separate credentials from the ones you used to get here, because rm-server
 * is a separate Supabase project with its own users — an rm-web session means
 * nothing there. Said plainly on the form, because "sign in again" with no
 * explanation reads like a bug or a phishing page.
 *
 * We never store the password. Only the session, for this browser.
 */
export function BotConnect({ connected }: { connected: boolean }) {
  const t = useTranslations("adminBot.connect");
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (connected) {
    return (
      <div className="surface flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
        <p className="text-sm text-fg-muted">
          {t("connectedAs")}
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await disconnectFromBot();
              if (res.ok) {
                toast.success(t("disconnected"));
                router.refresh();
              } else toast.error(t(`errors.${res.error}`));
            })
          }
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
        >
          <Unplug className="size-4" aria-hidden="true" />
          {t("disconnect")}
        </button>
      </div>
    );
  }

  return (
    <form
      className="surface rounded-xl border border-accent/40 bg-accent/5 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await connectToBot(email, password);
          if (res.ok) {
            toast.success(t("connected"));
            setPassword("");
            router.refresh();
          } else toast.error(t(`errors.${res.error}`));
        });
      }}
    >
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-accent" aria-hidden="true" />
        <h3 className="text-sm font-semibold">{t("title")}</h3>
      </div>
      <p className="mt-2 max-w-prose text-xs leading-relaxed text-fg-muted">
        {t("why")}
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex-1 basis-56 text-xs text-fg-muted">
          {t("email")}
          <input
            type="email"
            required
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field-input mt-1 w-full rounded-md px-3 py-2 text-sm"
          />
        </label>
        <label className="flex-1 basis-56 text-xs text-fg-muted">
          {t("password")}
          <input
            type="password"
            required
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field-input mt-1 w-full rounded-md px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot disabled:opacity-50"
        >
          {pending ? t("connecting") : t("connect")}
        </button>
      </div>
    </form>
  );
}
