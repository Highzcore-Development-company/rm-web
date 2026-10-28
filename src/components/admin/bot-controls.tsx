"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Pause, Play, Power } from "lucide-react";
import {
  setCloseAtProfit,
  setLotSize,
  setMarketEnabled,
  setTradingEnabled,
} from "@/app/(app)/app/admin/(panel)/bot/actions";
import { useToast } from "@/stores";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { pipLineFor, type Quotes } from "@/lib/admin/pip-value";
import { parseMoney } from "@/lib/price";

export type MarketConfig = {
  symbol: string;
  alias: string | null;
  lotSize: number | null;
  closeAtProfit: number | null;
  enabled: boolean;
};

/**
 * A8 — the real operator controls.
 *
 * Deliberately NOT in operator-controls.tsx. That file exports these same
 * names as inert stand-ins so the ported investor desk cannot act on the
 * master account, and making them live there would hand every investor a kill
 * switch. The power belongs here, behind bot.configure.
 */

/**
 * How long the desk is standing down for.
 *
 * Presets rather than a date picker, because these are the reasons people
 * actually stop the bot: a news release in half an hour, the rest of the
 * session, the weekend. "Until I start it again" is first and is the
 * default — a deadline nobody chose would be worse than no deadline.
 *
 * Kept as minutes-from-now rather than wall-clock times so none of it
 * depends on which timezone the admin is in.
 */
const RESUME_PRESETS: { label: string; minutes: number | null }[] = [
  { label: "Until I start it again", minutes: null },
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "4 hours", minutes: 240 },
  { label: "Tomorrow", minutes: 24 * 60 },
];

function labelFor(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  if (minutes === 24 * 60) return "24 hours";
  const hours = minutes / 60;
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

/**
 * A scheduled resume, in the reader's own timezone.
 *
 * The time is what matters operationally, so it leads. The date is added
 * only when it is not today — "08:00" is unambiguous this morning and badly
 * ambiguous on Friday for a bot stopped on Wednesday.
 *
 * ONLY EVER CALLED AFTER MOUNT. See `useMounted` below: this reads the
 * browser's locale and today's date, and the server has neither, so rendering
 * it during SSR is a guaranteed hydration mismatch.
 */
function formatResume(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "at a scheduled time";

  const time = when.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const sameDay = when.toDateString() === new Date().toDateString();
  if (sameDay) return `at ${time}`;
  return `${when.toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
  })} at ${time}`;
}

/**
 * True once the browser has taken over.
 *
 * Anything derived from the local clock or locale — "is this today", what
 * 08:00 looks like here — differs between the server that rendered the HTML
 * and the browser that hydrates it, and React treats that as a corrupted
 * tree rather than a cosmetic difference. Gating on this renders a stable
 * placeholder on the server and the real answer a tick later.
 */
function useMounted(): boolean {
  // useSyncExternalStore rather than useState+useEffect: it has a server
  // snapshot built in, so this is one render with the right answer instead
  // of a setState in an effect that re-renders the whole card.
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/** `datetime-local` wants the LOCAL wall clock, not an ISO instant. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/** The global switch. Given its own treatment because it stops everything. */
export function TradingSwitch({
  enabled,
  configurable,
  /** A resume already scheduled, so the card can say so. */
  resumeAt = null,
}: {
  /**
   * NULL MEANS WE COULD NOT READ IT, and it is not the same as false.
   *
   * This card previously took `trading_enabled ?? false`, so a failed select
   * rendered as "The bot is stopped". On 22 Oct it said exactly that for two
   * hours while the bot was trading normally. A kill switch that cannot
   * distinguish "off" from "don't know" is worse than one that admits it.
   */
  enabled: boolean | null;
  configurable: boolean;
  resumeAt?: string | null;
}) {
  const t = useTranslations("adminBot");
  const toast = useToast();
  const router = useRouter();
  const mounted = useMounted();
  const [pending, start] = useTransition();
  const [confirmOff, setConfirmOff] = useState(false);
  const [resumeMinutes, setResumeMinutes] = useState<number | null>(null);
  /** A specific wall-clock time, when the presets are not the answer. */
  const [resumeExact, setResumeExact] = useState("");
  /**
   * The bounds for the time field, fixed when the dialog opens.
   *
   * Stored rather than derived in render: `new Date()` during render is an
   * impure call, it would make the attributes change on every keystroke, and
   * on the server it would not match the browser at all.
   */
  const [bounds, setBounds] = useState<{ min: string; max: string } | null>(null);

  const unknown = enabled === null;
  const on = enabled === true;

  // One place that actually flips it, so the confirmed path and the
  // straight-through path cannot drift apart.
  //
  // The time is computed HERE, at the moment of confirming, not when the
  // dialog opened. Somebody who picks "1 hour" and then reads the warning
  // for five minutes means an hour from pressing the button.
  const apply = (minutes: number | null = null, exact = "") =>
    start(async () => {
      // An exact time wins when one is set — it is the more specific thing
      // the person said. datetime-local gives local wall clock; new Date()
      // reads it in the browser's zone, which is the one they typed it in.
      const resume = exact
        ? new Date(exact).toISOString()
        : minutes === null
          ? null
          : new Date(Date.now() + minutes * 60_000).toISOString();
      const res = await setTradingEnabled(!on, resume);
      if (res.ok) {
        // Stopped, but the resume could not be stored. Said as a warning
        // rather than a success: somebody who walks away believing the bot
        // restarts at 08:00 is worse off than somebody who knows it will not.
        if (res.scheduledResume === false) {
          toast.error(t("switch.resumeUnavailable"));
        } else {
          toast.success(on ? t("switch.stopped") : t("switch.started"));
        }
        router.refresh();
      } else toast.error(t(`errors.${res.error}`));
    });

  return (
    <div
      // STACKS ON A PHONE. flex-wrap alone left the button on its own row
      // but still shrink-wrapped and left-aligned under the text, which reads
      // as a stray control rather than the action for this card.
      className={`surface flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:p-5 ${
        unknown
          ? "border-border"
          : on
            ? "border-chart-up/40"
            : "border-chart-down/40"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <span
          className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${
            unknown
              ? "bg-fg-subtle/10 text-fg-muted"
              : on
                ? "bg-chart-up/10 text-chart-up"
                : "bg-chart-down/10 text-chart-down"
          }`}
        >
          <Power className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {unknown
              ? t("switch.unknown")
              : on
                ? t("switch.on")
                : t("switch.off")}
          </p>
          {/* A pending resume replaces the generic hint. When the bot is
              coming back on its own, that is the only thing anyone looking
              at this card needs to read.

              `mounted` gates it because the text is the reader's local
              time — rendering it on the server guarantees a hydration
              mismatch. The hint shows for one tick instead. */}
          {unknown ? (
            <p className="mt-0.5 text-xs text-fg-muted">
              {t("switch.unknownHint")}
            </p>
          ) : !on && resumeAt && mounted ? (
            <p className="mt-0.5 text-xs text-accent">
              Starts again {formatResume(resumeAt)}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-fg-muted">{t("switch.hint")}</p>
          )}
        </div>
      </div>

      <button
        type="button"
        disabled={pending || !configurable || unknown}
        onClick={() => {
          // Confirmed on the way OFF only. Stopping the book is the
          // consequential direction; starting it again is recoverable by
          // pressing the same button.
          if (on) {
            // Fresh every time: a choice left over from the last stop is not
            // a choice anyone made about this one.
            setResumeMinutes(null);
            setResumeExact("");
            const now = Date.now();
            setBounds({
              // A minute out, so the field cannot offer a time the server
              // will reject for being in the past.
              min: toLocalInput(new Date(now + 60_000)),
              max: toLocalInput(new Date(now + 14 * 86_400_000)),
            });
            setConfirmOff(true);
            return;
          }
          apply();
        }}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50 sm:w-auto ${
          on
            ? "border border-chart-down/50 text-fg hover:border-chart-down"
            : "bg-accent text-[#0A0A0A] hover:bg-accent-hot"
        }`}
      >
        {on ? (
          <>
            <Pause className="size-4" aria-hidden="true" />
            {t("switch.stop")}
          </>
        ) : (
          <>
            <Play className="size-4" aria-hidden="true" />
            {t("switch.start")}
          </>
        )}
      </button>

      {confirmOff ? (
        <ConfirmDialog
          title="Stop the bot trading?"
          subject="The master account, and every linked investor"
          body="It opens nothing new. Anything already open keeps running and is still managed — stops, targets and the profit ladder all stay active."
          action={
            resumeExact
              ? "Stop, back on at that time"
              : resumeMinutes === null
                ? "Stop trading"
                : `Stop, back on in ${labelFor(resumeMinutes)}`
          }
          destructive
          pending={pending}
          onCancel={() => setConfirmOff(false)}
          onConfirm={() => {
            setConfirmOff(false);
            apply(resumeMinutes, resumeExact);
          }}
        >
          {/* ASKED ON THE WAY OFF, which is the only moment anyone knows the
              answer. "Back at 8" is a thought you have while stopping it;
              an hour later it is just a bot that is off and nobody is sure
              why. The old flow had no place to put that, so the bot stayed
              down until somebody noticed. */}
          <fieldset className="mt-4">
            <legend className="text-xs font-medium text-fg">
              Start again
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {RESUME_PRESETS.map((p) => {
                // An exact time overrides the presets, so none of them reads
                // as chosen while one is typed.
                const active = !resumeExact && resumeMinutes === p.minutes;
                return (
                  <button
                    key={p.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setResumeMinutes(p.minutes);
                      setResumeExact("");
                    }}
                    className={`rounded-lg border px-3 py-1.5 text-xs ${
                      active
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-fg-muted hover:border-fg-subtle"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* A SPECIFIC TIME, because "30 minutes" is not how people
                actually think about this. "Back at 08:00 before London" is,
                and the presets cannot express it — the nearest they get is
                arithmetic the person has to do in their head at the moment
                they are trying to stop a bot.

                Rendered only after mount: `min` is derived from the local
                clock, and an attribute the server computes differently is a
                hydration mismatch. */}
            {mounted ? (
              <label className="mt-3 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                <span>or at</span>
                <input
                  type="datetime-local"
                  value={resumeExact}
                  // The browser refuses a time in the past, so the message
                  // arrives before the server has to say no.
                  min={bounds?.min}
                  max={bounds?.max}
                  onChange={(e) => setResumeExact(e.target.value)}
                  // min-w-0 so a phone keyboard's wide date control cannot
                  // push the dialog into a horizontal scroll.
                  className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-xs text-fg [color-scheme:dark]"
                />
                {resumeExact ? (
                  <button
                    type="button"
                    onClick={() => setResumeExact("")}
                    className="text-fg-muted underline underline-offset-2 hover:text-fg"
                  >
                    clear
                  </button>
                ) : null}
              </label>
            ) : null}

            <p className="mt-2 text-[11px] leading-relaxed text-fg-muted">
              {resumeExact
                ? "It turns itself back on at that time. Quiet hours still apply, so it waits for the window to end."
                : resumeMinutes === null
                  ? "It stays off until somebody starts it. Nothing will start it for you."
                  : `It turns itself back on ${labelFor(resumeMinutes)} from now. ` +
                    "Quiet hours still apply, so it waits for the window to end."}
            </p>
          </fieldset>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

/** Per-market lot size, close-at-profit and enable. */
export function MarketControls({
  markets,
  configurable,
  quotes = {},
}: {
  markets: MarketConfig[];
  configurable: boolean;
  /** Live prices, so the pip line under each lot box is computed not guessed. */
  quotes?: Quotes;
}) {
  const t = useTranslations("adminBot");

  if (markets.length === 0) {
    return <p className="text-sm text-fg-muted">{t("noMarkets")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
            <th scope="col" className="py-2 pr-4 font-medium">{t("cols.market")}</th>
            <th scope="col" className="py-2 pr-4 font-medium">{t("cols.lot")}</th>
            <th scope="col" className="py-2 pr-4 font-medium">{t("cols.profit")}</th>
            <th scope="col" className="py-2 font-medium">{t("cols.enabled")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {markets.map((market) => (
            <MarketRow
              key={market.symbol}
              market={market}
              configurable={configurable}
              quotes={quotes}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarketRow({
  market,
  configurable,
  quotes,
}: {
  market: MarketConfig;
  configurable: boolean;
  quotes: Quotes;
}) {
  const t = useTranslations("adminBot");
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  const [lot, setLot] = useState(market.lotSize?.toString() ?? "");
  const [profit, setProfit] = useState(market.closeAtProfit?.toString() ?? "");

  /**
   * "These controls move real money. Confirm before acting, show what the
   * value was before and what it will be."
   *
   * These three used to commit straight off a blur, which meant tabbing out of
   * a field with a typo in it changed the size of a live trade with no step in
   * between. Nothing is sent until it is confirmed, and the confirmation shows
   * BOTH values — "0.01 → 0.5" is a sentence somebody can catch a mistake in,
   * where "are you sure?" is not.
   */
  const [confirming, setConfirming] = useState<{
    what: "lot" | "profit" | "enabled";
    from: string;
    to: string;
    apply: () => void;
  } | null>(null);

  const blank = t("blankValue");
  const show = (v: string) => (v.trim() === "" ? blank : v);

  function askLot() {
    const was = market.lotSize?.toString() ?? "";
    if (lot === was) return;
    setConfirming({
      what: "lot",
      from: show(was),
      to: show(lot),
      apply: () =>
        start(async () => {
          // parseMoney here too: a lot size is not money, but somebody who
          // has just typed "$5" in the box beside it should not be punished
          // for a stray symbol. Same tolerance, same anchored refusal of
          // anything that is not a number.
          const res = await setLotSize(market.symbol, parseMoney(lot) ?? NaN);
          setConfirming(null);
          if (res.ok) {
            // Says what happens next, because it is not instant: the bot
            // re-reads settings about once a minute and may snap the value.
            toast.success(t("saved.lot", { symbol: market.symbol }));
            router.refresh();
          } else {
            toast.error(t(`errors.${res.error}`));
            setLot(was);
          }
        }),
    });
  }

  function askProfit() {
    const was = market.closeAtProfit?.toString() ?? "";
    if (profit === was) return;
    setConfirming({
      what: "profit",
      from: show(was),
      to: show(profit),
      apply: () =>
        start(async () => {
          // parseMoney, not Number(): Number("5$") is NaN, so typing the
          // amount the way Victor wrote it — "keep it at 5$" — was refused
          // as "must be a number greater than zero". The value was fine.
          const value = parseMoney(profit);
          const res = await setCloseAtProfit(market.symbol, value);
          setConfirming(null);
          if (res.ok) {
            toast.success(t("saved.profit", { symbol: market.symbol }));
            router.refresh();
          } else {
            toast.error(t(`errors.${res.error}`));
            setProfit(was);
          }
        }),
    });
  }

  function askEnabled(next: boolean) {
    setConfirming({
      what: "enabled",
      from: market.enabled ? t("on") : t("off"),
      to: next ? t("on") : t("off"),
      apply: () =>
        start(async () => {
          const res = await setMarketEnabled(market.symbol, next);
          setConfirming(null);
          if (res.ok) {
            toast.success(
              next
                ? t("saved.enabled", { symbol: market.symbol })
                : t("saved.disabled", { symbol: market.symbol }),
            );
            router.refresh();
          } else toast.error(t(`errors.${res.error}`));
        }),
    });
  }

  function cancel() {
    // Put the inputs back. Leaving the typed value on screen after cancelling
    // would show a number the bot does not have.
    setLot(market.lotSize?.toString() ?? "");
    setProfit(market.closeAtProfit?.toString() ?? "");
    setConfirming(null);
  }

  const row = (
    <tr className={market.enabled ? undefined : "opacity-50"}>
      <th scope="row" className="py-3 pr-4 font-mono text-xs font-normal">
        {market.symbol}
      </th>

      <td className="py-3 pr-4 align-top">
        <input
          inputMode="decimal"
          value={lot}
          disabled={pending || !configurable}
          onChange={(e) => setLot(e.target.value)}
          // Committed on blur and on Enter, not per keystroke: every keystroke
          // would be a write to the bot's database.
          onBlur={askLot}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="field-input w-24 rounded-md px-2 py-1.5 text-sm tabular-nums"
        />

        {/* What this size is actually worth, under the box, updating as it is
            typed. "0.1" means nothing on its own; "$1.00 a pip" is the number
            a person reasons with, and lot size is the one setting that decides
            how much money a trade moves.

            Shown for the TYPED value, not the saved one — the point is to see
            what you are about to do before confirming it. Blank when we have
            no figure for the market, because a confident wrong number here is
            worse than none. */}
        <p className="mt-1 text-[11px] leading-tight text-fg-muted">
          {pipLineFor(market.symbol, lot, quotes)}
        </p>
      </td>

      <td className="py-3 pr-4 align-top">
        <input
          inputMode="decimal"
          value={profit}
          placeholder={t("noProfitTarget")}
          disabled={pending || !configurable}
          onChange={(e) => setProfit(e.target.value)}
          onBlur={askProfit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="field-input w-28 rounded-md px-2 py-1.5 text-sm tabular-nums"
        />
      </td>

      <td className="py-3">
        <input
          type="checkbox"
          checked={market.enabled}
          disabled={pending || !configurable}
          onChange={(e) => askEnabled(e.target.checked)}
          className="control"
        />
      </td>
    </tr>
  );

  if (!confirming) return row;

  return (
    <>
      {row}
      {/* A row of its own rather than a browser confirm(): it has to show two
          values side by side, and a native dialog can only show a sentence. */}
      <tr className="bg-accent/[0.06]">
        <td colSpan={4} className="px-2 py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <span className="font-mono text-xs">{market.symbol}</span>
            <span className="text-fg-muted">{t(`field.${confirming.what}`)}</span>
            <span className="tabular-nums text-fg-muted line-through">
              {confirming.from}
            </span>
            <span aria-hidden="true" className="text-fg-muted">→</span>
            <span className="tabular-nums font-semibold">{confirming.to}</span>

            <span className="ml-auto flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={confirming.apply}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-[#0A0A0A] disabled:opacity-50"
              >
                {pending ? t("applying") : t("apply")}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={cancel}
                className="rounded-md border border-border px-3 py-1.5 text-xs text-fg-muted hover:text-fg disabled:opacity-50"
              >
                {t("cancel")}
              </button>
            </span>
          </div>
        </td>
      </tr>
    </>
  );
}
