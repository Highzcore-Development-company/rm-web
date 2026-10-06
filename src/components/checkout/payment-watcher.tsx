"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2, Clock3, Loader2, Send, XCircle } from "lucide-react";
import {
  getPaymentStatus,
  type PaymentStatus,
} from "@/app/(app)/app/checkout/status";
import { useToast } from "@/components/toast";

/** Often enough to feel live, rarely enough not to hammer TronGrid. */
const POLL_MS = 8000;

/**
 * Watches one payment and says where it has got to.
 *
 * Without this the page is a dead end: you send USDT and nothing on screen
 * ever changes, which looks identical to it not having worked. The scheduled
 * watcher would credit it eventually, but "eventually" is not something to
 * leave someone staring at.
 */
export function PaymentWatcher({ subscriptionId }: { subscriptionId: string }) {
  const t = useTranslations("checkout.status");
  const router = useRouter();
  const toast = useToast();

  const [status, setStatus] = useState<PaymentStatus>({ state: "awaiting" });

  // Nothing is watched until they say they have sent it. Polling the chain
  // before someone has opened their wallet is noise, and more importantly it
  // leaves them no way to say "I have done my part" — so a page that is simply
  // waiting looks identical to a page that has not noticed.
  const [watching, setWatching] = useState(false);

  useEffect(() => {
    if (!watching) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function check() {
      const next = await getPaymentStatus(subscriptionId);
      if (cancelled) return;

      setStatus(next);

      // Stop polling once there is nothing left to wait for.
      if (next.state === "confirmed") {
        toast.success(t("confirmed"));
        router.refresh();
        return;
      }
      // Stop polling on a problem too: it will not resolve itself, and a
      // spinner next to "something is wrong" says we are still hoping.
      if (
        next.state === "expired" ||
        next.state === "unknown" ||
        next.state === "problem"
      )
        return;

      timer = setTimeout(check, POLL_MS);
    }

    void check();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // subscriptionId is the only input; re-running on t/toast/router identity
    // would restart the poll loop on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriptionId, watching]);

  if (!watching) {
    return (
      <div className="mt-5 rounded-xl border border-border p-4">
        <p className="text-sm font-medium">{t("idle")}</p>
        <p className="mt-1 text-xs leading-relaxed text-fg-muted">
          {t("idleHint")}
        </p>

        <button
          type="button"
          onClick={() => {
            setWatching(true);
            // Pressing it changed a spinner into a slightly different
            // spinner. Confirming out loud is what makes it feel like the
            // press did something.
            toast.success(t("watchingToast"));
          }}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-[#0A0A0A] shadow-[var(--glow-accent)] transition-all hover:bg-accent-hot"
        >
          <Send className="size-3.5" aria-hidden="true" />
          {t("sentIt")}
        </button>

        {/* Pressing it early costs nothing — it starts a watcher, it does not
            claim anything — so the copy removes the pressure to be precise. */}
        <p className="mt-3 text-xs text-fg-muted">{t("notYet")}</p>
      </div>
    );
  }

  if (status.state === "problem") {
    return (
      <div className="mt-5 rounded-xl border border-chart-down/50 bg-chart-down/5 p-4">
        <div className="flex items-start gap-3">
          <XCircle
            className="mt-0.5 size-4 shrink-0 text-chart-down"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p aria-live="polite" className="text-sm font-medium">
              {t("problem")}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-fg-muted">
              {t(status.kind)}
            </p>
            {/* The specifics — amounts, the token that arrived — so support
                does not have to ask them what they sent. */}
            {status.detail ? (
              <p className="mt-2 font-mono text-xs text-fg-muted">
                {status.detail}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const tone =
    status.state === "confirmed"
      ? "border-chart-up/40 bg-chart-up/5"
      : status.state === "expired"
        ? "border-chart-down/40 bg-chart-down/5"
        : "border-border";

  return (
    <div className={`mt-5 rounded-xl border p-4 ${tone}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">
          {status.state === "confirmed" ? (
            <CheckCircle2 className="size-4 text-chart-up" aria-hidden="true" />
          ) : status.state === "expired" ? (
            <XCircle className="size-4 text-chart-down" aria-hidden="true" />
          ) : status.state === "seen" ? (
            <Clock3 className="size-4 text-accent" aria-hidden="true" />
          ) : (
            <Loader2
              className="size-4 animate-spin text-fg-muted"
              aria-hidden="true"
            />
          )}
        </span>

        <div className="min-w-0">
          {/* Announced, so somebody who cannot see the spinner is still told
              when their money arrives. */}
          <p aria-live="polite" className="text-sm font-medium">
            {status.state === "seen"
              ? t("seen")
              : status.state === "confirmed"
                ? t("confirmed")
                : status.state === "expired"
                  ? t("expired")
                  : t("awaiting")}
          </p>

          <p className="mt-1 text-xs leading-relaxed text-fg-muted">
            {status.state === "seen"
              ? t("seenHint", {
                  confirmations: status.confirmations,
                  required: status.required,
                })
              : status.state === "confirmed"
                ? t("confirmedHint")
                : status.state === "expired"
                  ? t("expiredHint")
                  : t("awaitingHint")}
          </p>

          {/* Offered while waiting too, not only once confirmed. A transfer
              can take minutes and they are told we will email them — so the
              page has to let them leave rather than implying they must sit
              here watching it. */}
          {status.state === "confirmed" ? (
            <a
              href="/app/dashboard"
              className="mt-3 inline-block text-sm text-accent underline underline-offset-2"
            >
              {t("toDashboard")}
            </a>
          ) : (
            <div className="mt-3">
              <a
                href="/app/dashboard"
                className="text-sm text-accent underline underline-offset-2"
              >
                {t("toDashboard")}
              </a>
              <p className="mt-1 text-xs text-fg-muted">{t("leaveHint")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
