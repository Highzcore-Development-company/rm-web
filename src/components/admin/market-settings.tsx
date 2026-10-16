"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Power, TriangleAlert } from "lucide-react";
import {
  setCloseAtProfit,
  setLotSize,
  setMarketEnabled,
} from "@/app/(app)/app/admin/(panel)/bot/actions";
import { useToast } from "@/stores";
import { pipLineFor, pipValueFor, BROKER_MINIMUM_LOTS } from "@/lib/admin/pip-value";

/**
 * One market's settings — lot size, profit target, on/off.
 *
 * Reuses the server actions the old panel already had. They validate, write as
 * the signed-in admin on rm-server, treat a write that changed no rows as a
 * FAILURE (see the comment on `refused` in bot/actions.ts — a silently
 * successful kill switch was a real bug here), and record an audit entry.
 *
 * NOTHING COMMITS WITHOUT A CONFIRMATION showing the old value and the new
 * one. These controls move real money, and an earlier version committed on
 * blur — so tabbing out of a field with a typo in it changed the size of a
 * live trade with no step in between. "0.01 → 0.5" is a sentence somebody can
 * catch a mistake in; "Are you sure?" is not.
 */

export type MarketSettingsProps = {
  symbol: string;
  alias: string;
  lotSize: number | null;
  closeAtProfit: number | null;
  enabled: boolean;
  configurable: boolean;
  /**
   * Account balance, for turning a percentage into a dollar figure.
   *
   * Null when rm-server has no snapshot — the percentage control is then
   * disabled rather than guessing, because a percentage of an unknown balance
   * is an unknown dollar amount and this control closes real trades.
   */
  balance: number | null;
};

export function MarketSettings(props: MarketSettingsProps) {
  const { symbol, alias, configurable, balance } = props;
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  const [lot, setLot] = useState(props.lotSize?.toString() ?? "");
  const [profit, setProfit] = useState(props.closeAtProfit?.toString() ?? "");
  const [percent, setPercent] = useState("");
  const [mode, setMode] = useState<"amount" | "percent">("amount");

  const [confirming, setConfirming] = useState<{
    what: string;
    from: string;
    to: string;
    detail?: string;
    apply: () => void;
  } | null>(null);

  const show = (value: string) => (value.trim() === "" ? "broker minimum" : value);

  function askLot() {
    const was = props.lotSize?.toString() ?? "";
    if (lot === was) return;
    setConfirming({
      what: "Lot size",
      from: show(was),
      to: show(lot),
      detail: pipLineFor(symbol, lot),
      apply: () =>
        start(async () => {
          const result = await setLotSize(symbol, Number(lot));
          setConfirming(null);
          if (result.ok) {
            // Says what happens next, because it is not instant: the bot
            // re-reads config about once a minute and may snap the value to
            // the broker's step.
            toast.success(
              `${alias} lot size saved. The bot picks it up within a minute.`,
            );
            router.refresh();
          } else {
            toast.error(errorText(result.error));
            setLot(was);
          }
        }),
    });
  }

  function askProfit(value: number | null, label: string, detail?: string) {
    const was = props.closeAtProfit;
    setConfirming({
      what: "Profit target",
      from: was === null ? "off" : `$${was.toFixed(2)}`,
      to: label,
      detail,
      apply: () =>
        start(async () => {
          const result = await setCloseAtProfit(symbol, value);
          setConfirming(null);
          if (result.ok) {
            toast.success(
              value === null
                ? `${alias} profit target switched off.`
                : `${alias} will close at $${value.toFixed(2)} profit.`,
            );
            router.refresh();
          } else {
            toast.error(errorText(result.error));
            setProfit(was?.toString() ?? "");
          }
        }),
    });
  }

  function askEnabled(next: boolean) {
    setConfirming({
      what: next ? "Enable market" : "Turn market OFF",
      from: props.enabled ? "on" : "off",
      to: next ? "on" : "off",
      detail: next
        ? undefined
        : "The bot opens nothing new here. Anything already open keeps running and is still managed.",
      apply: () =>
        start(async () => {
          const result = await setMarketEnabled(symbol, next);
          setConfirming(null);
          if (result.ok) {
            toast.success(next ? `${alias} enabled.` : `${alias} turned off.`);
            router.refresh();
          } else toast.error(errorText(result.error));
        }),
    });
  }

  function cancel() {
    // Put the inputs back. Leaving a typed value on screen after cancelling
    // would show a number the bot does not have.
    setLot(props.lotSize?.toString() ?? "");
    setProfit(props.closeAtProfit?.toString() ?? "");
    setPercent("");
    setConfirming(null);
  }

  // The percentage, resolved against the balance it was quoted on.
  const percentValue = Number(percent);
  const percentDollars =
    balance !== null && Number.isFinite(percentValue) && percentValue > 0
      ? (balance * percentValue) / 100
      : null;

  const lots = props.lotSize ?? BROKER_MINIMUM_LOTS;
  const pip = pipValueFor(symbol, lots);

  if (!configurable) {
    return (
      <p className="rounded-lg border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-fg-muted">
        You can see this market but not change it. Changing settings needs the
        <span className="font-medium"> bot.configure</span> permission and an
        rm-server connection.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {confirming ? (
        <div className="rounded-xl border border-accent/40 bg-accent/5 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <TriangleAlert className="size-4 text-accent" aria-hidden="true" />
            {confirming.what}
          </p>
          <p className="mt-2 text-sm tabular-nums">
            <span className="text-fg-muted">{confirming.from}</span>
            <span className="mx-2 text-fg-subtle">→</span>
            <span className="font-semibold">{confirming.to}</span>
          </p>
          {confirming.detail ? (
            <p className="mt-2 text-xs leading-relaxed text-fg-muted">
              {confirming.detail}
            </p>
          ) : null}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={confirming.apply}
              disabled={pending}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-[#0A0A0A] hover:bg-accent-hot disabled:opacity-60"
            >
              {pending ? "Saving…" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={pending}
              className="rounded-lg border border-border px-4 py-2 text-sm text-fg-muted hover:text-fg disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {/* ---- on / off ---- */}
      <Field
        label="Trading this market"
        help={
          props.enabled
            ? "The bot may open new trades here."
            : "OFF — the bot opens nothing new here. Open trades keep running."
        }
      >
        <button
          type="button"
          onClick={() => askEnabled(!props.enabled)}
          disabled={pending}
          className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
            props.enabled
              ? "border-border text-fg-muted hover:border-accent/40 hover:text-fg"
              : "border-accent/40 bg-accent/10 text-accent"
          }`}
        >
          <Power className="size-4" aria-hidden="true" />
          {props.enabled ? "Turn off" : "Turn on"}
        </button>
      </Field>

      {/* ---- lot size ---- */}
      <Field
        label="Lot size"
        help={`Blank is the broker minimum (${BROKER_MINIMUM_LOTS}). ${pipLineFor(symbol, lot)}`}
      >
        <div className="flex gap-2">
          <input
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={lot}
            onChange={(event) => setLot(event.target.value)}
            placeholder={String(BROKER_MINIMUM_LOTS)}
            className="w-32 rounded-lg border border-border bg-bg px-3 py-2 text-sm tabular-nums"
          />
          <button
            type="button"
            onClick={askLot}
            disabled={pending || lot === (props.lotSize?.toString() ?? "")}
            className="rounded-lg border border-border px-3 py-2 text-sm text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </Field>

      {/* ---- profit target ---- */}
      <Field
        label="Profit target"
        help="Close an open trade once its floating P&L reaches this. Off means it runs on its stop, target and profit ladder."
      >
        <div
          role="tablist"
          aria-label="Target type"
          className="mb-3 inline-flex rounded-lg border border-border p-0.5"
        >
          {(["amount", "percent"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mode === key}
              onClick={() => setMode(key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === key ? "bg-accent/15 text-accent" : "text-fg-muted hover:text-fg"
              }`}
            >
              {key === "amount" ? "Fixed amount" : "% of balance"}
            </button>
          ))}
        </div>

        {mode === "amount" ? (
          <div className="flex gap-2">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-fg-subtle">
                $
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={profit}
                onChange={(event) => setProfit(event.target.value)}
                placeholder="off"
                className="w-32 rounded-lg border border-border bg-bg py-2 pl-7 pr-3 text-sm tabular-nums"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                const trimmed = profit.trim();
                const value = trimmed === "" ? null : Number(trimmed);
                askProfit(
                  value,
                  value === null ? "off" : `$${value.toFixed(2)}`,
                  value !== null && pip.kind === "known"
                    ? `About ${Math.round(value / pip.usd)} pips at ${lots} lots.`
                    : undefined,
                );
              }}
              disabled={pending || profit === (props.closeAtProfit?.toString() ?? "")}
              className="rounded-lg border border-border px-3 py-2 text-sm text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
            >
              Save
            </button>
            {props.closeAtProfit !== null ? (
              <button
                type="button"
                onClick={() => askProfit(null, "off")}
                disabled={pending}
                className="rounded-lg border border-border px-3 py-2 text-sm text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
              >
                Switch off
              </button>
            ) : null}
          </div>
        ) : (
          <div>
            <div className="flex gap-2">
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  inputMode="decimal"
                  value={percent}
                  onChange={(event) => setPercent(event.target.value)}
                  placeholder="2"
                  disabled={balance === null}
                  className="w-32 rounded-lg border border-border bg-bg py-2 pl-3 pr-7 text-sm tabular-nums disabled:opacity-50"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-fg-subtle">
                  %
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  percentDollars !== null &&
                  askProfit(
                    Number(percentDollars.toFixed(2)),
                    `$${percentDollars.toFixed(2)}`,
                    `${percent}% of the $${balance?.toFixed(2)} balance, stored as a dollar amount.`,
                  )
                }
                disabled={pending || percentDollars === null}
                className="rounded-lg border border-border px-3 py-2 text-sm text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
              >
                Save
              </button>
            </div>

            {/* SAID PLAINLY, because the two are not the same thing. The bot
                holds a dollar target; a percentage is converted here, against
                the balance at the moment it is saved. It does not follow the
                balance as the account grows. */}
            <p className="mt-2 max-w-md text-xs leading-relaxed text-fg-muted">
              {balance === null ? (
                <>
                  No balance snapshot from rm-server, so a percentage cannot be
                  converted. Use a fixed amount.
                </>
              ) : percentDollars !== null ? (
                <>
                  <span className="font-medium text-fg">
                    {percent}% of ${balance.toFixed(2)} = $
                    {percentDollars.toFixed(2)}
                  </span>{" "}
                  — saved as that dollar amount. The bot stores a dollar target,
                  so this is converted once, now; it does not track the balance
                  as the account grows.
                </>
              ) : (
                <>
                  Converted against the current balance of ${balance.toFixed(2)}{" "}
                  and saved as a dollar amount.
                </>
              )}
            </p>
          </div>
        )}
      </Field>
    </div>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-border pt-5 first:border-t-0 first:pt-0">
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-fg-muted">{help}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** The action's error codes, in words an admin can act on. */
function errorText(code: string): string {
  switch (code) {
    case "forbidden":
      return "You do not have permission to change the bot.";
    case "not_connected":
      return "Not connected to rm-server. Connect on the Bot page first.";
    case "bad_lot":
      return "That lot size is not a positive number.";
    case "bad_profit":
      return "That profit target is not a positive number.";
    case "refused":
      return "rm-server refused the write — check this admin is in bot_admins.";
    default:
      return `Could not save (${code}).`;
  }
}
