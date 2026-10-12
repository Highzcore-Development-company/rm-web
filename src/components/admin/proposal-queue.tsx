"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, ShieldQuestion, X } from "lucide-react";
import {
  decideProposal,
  setRequireApproval,
} from "@/app/(app)/app/admin/(panel)/bot/actions";
import { useToast } from "@/components/toast";

export type PendingProposal = {
  id: string;
  symbol: string;
  side: string;
  level: number;
  sl: number | null;
  tp: number | null;
  rr: number | null;
  createdAt: string;
};

/**
 * Ask-before-trading, and the queue it produces.
 *
 * With approval on, the bot stops placing its own orders: it writes a proposal
 * and waits for an answer. Nothing reaches the market until somebody says yes.
 *
 * WHAT THIS IS NOT. Approving is not placing a trade. The bot chose the
 * symbol, the level, the stop and the target; the bot's own loop places it
 * afterwards, or declines to if price has already run past the level. An admin
 * answers the bot's question and never composes an order — the line the spec
 * draws, which is that an admin configures the bot and the bot trades.
 */
export function ApprovalMode({
  required,
  configurable,
}: {
  required: boolean;
  configurable: boolean;
}) {
  const t = useTranslations("adminBot.approval");
  // Errors live alongside the proposal queue's, not under approval: they are
  // the same failures (no session, no permission) and one copy is enough.
  const tError = useTranslations("adminBot.proposals.errors");
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div className="surface flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border p-5">
      <div className="flex items-center gap-4">
        <span
          className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${
            required ? "bg-accent/10 text-accent" : "bg-surface text-fg-muted"
          }`}
        >
          <ShieldQuestion className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-medium">
            {required ? t("on") : t("off")}
          </p>
          <p className="mt-0.5 max-w-prose text-xs leading-relaxed text-fg-muted">
            {required ? t("onNote") : t("offNote")}
          </p>
        </div>
      </div>

      <button
        type="button"
        disabled={pending || !configurable}
        onClick={() => {
          // Confirmed only when turning it OFF. Letting the bot place its own
          // orders again is the consequential direction; switching it on just
          // means more proposals wait for you.
          if (required && !window.confirm(t("confirmOff"))) return;

          start(async () => {
            const res = await setRequireApproval(!required);
            if (res.ok) {
              toast.success(required ? t("turnedOff") : t("turnedOn"));
              router.refresh();
            } else toast.error(tError(res.error));
          });
        }}
        className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:border-accent disabled:opacity-50"
      >
        {required ? t("turnOff") : t("turnOn")}
      </button>
    </div>
  );
}

export function ProposalQueue({
  proposals,
  configurable,
}: {
  proposals: PendingProposal[];
  configurable: boolean;
}) {
  const t = useTranslations("adminBot.proposals");

  if (proposals.length === 0) {
    return <p className="text-sm text-fg-muted">{t("none")}</p>;
  }

  return (
    <ul className="space-y-3">
      {proposals.map((p) => (
        <ProposalCard key={p.id} proposal={p} configurable={configurable} />
      ))}
    </ul>
  );
}

function ProposalCard({
  proposal,
  configurable,
}: {
  proposal: PendingProposal;
  configurable: boolean;
}) {
  const t = useTranslations("adminBot.proposals");
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  const buy = proposal.side.toLowerCase().startsWith("buy");
  const px = (n: number | null) => (n == null ? "—" : String(n));

  function decide(approved: boolean, reason?: string) {
    start(async () => {
      const res = await decideProposal(proposal.id, approved, reason);
      if (res.ok) {
        toast.success(approved ? t("approved") : t("rejected"));
        setRejecting(false);
        router.refresh();
      } else toast.error(t(`errors.${res.error}`));
    });
  }

  return (
    <li className="surface rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            {/* Direction in the WORD, not only the colour: buy and sell are
                the whole meaning of the row. */}
            <span className={buy ? "text-chart-up" : "text-chart-down"}>
              {buy ? t("buy") : t("sell")}
            </span>
            <span className="font-mono">{proposal.symbol}</span>
          </p>
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs tabular-nums text-fg-muted">
            <div className="flex gap-1.5">
              <dt>{t("level")}</dt>
              <dd className="text-fg">{proposal.level}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>{t("sl")}</dt>
              <dd className="text-fg">{px(proposal.sl)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>{t("tp")}</dt>
              <dd className="text-fg">{px(proposal.tp)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>{t("rr")}</dt>
              <dd className="text-fg">
                {proposal.rr == null ? "—" : proposal.rr.toFixed(2)}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-fg-muted">
            {t("proposed", {
              when: new Date(proposal.createdAt).toLocaleString("en-GB", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }),
            })}
          </p>
        </div>

        {!rejecting && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || !configurable}
              onClick={() => decide(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot disabled:opacity-50"
            >
              <Check className="size-4" aria-hidden="true" />
              {t("approve")}
            </button>
            <button
              type="button"
              disabled={pending || !configurable}
              onClick={() => setRejecting(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
            >
              <X className="size-4" aria-hidden="true" />
              {t("reject")}
            </button>
          </div>
        )}
      </div>

      {rejecting && (
        <form
          className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            decide(false, note);
          }}
        >
          <label className="flex-1 basis-60 text-xs text-fg-muted">
            {/* Required, because a rejected proposal with no reason is
                unreadable a week later — was the strategy wrong, or was the
                operator nervous? */}
            {t("reason")}
            <input
              required
              minLength={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="field-input mt-1 w-full rounded-md px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg border border-chart-down/50 px-3 py-2 text-sm transition-colors hover:border-chart-down disabled:opacity-50"
          >
            {t("confirmReject")}
          </button>
          <button
            type="button"
            onClick={() => setRejecting(false)}
            className="px-2 py-2 text-sm text-fg-muted hover:text-fg"
          >
            {t("cancel")}
          </button>
        </form>
      )}
    </li>
  );
}
