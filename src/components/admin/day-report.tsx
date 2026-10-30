"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus, Plus, X } from "lucide-react";
import {
  addPlanItem,
  answerItem,
  closeDay,
  removePlanItem,
  reopenDay,
  saveNote,
} from "@/app/(app)/app/admin/(panel)/reports/actions";
import { useToast } from "@/stores";

export type DayItem = {
  id: string;
  plan: string;
  done: boolean | null;
  outcome: string | null;
};

/**
 * One person's day — the plan in the morning, the answers in the evening.
 *
 * ONE SCREEN, NOT TWO. SOD and EOD are the same list read at two times of
 * day, so splitting them into separate forms would mean re-typing in the
 * evening what was typed in the morning, and the comparison — which is the
 * whole point — would be something a reader had to do themselves.
 *
 * NOTHING IS "SUBMITTED" IN THE MORNING. Writing the first item files the
 * plan; a separate "submit" button is a step that exists only to be
 * forgotten, and a plan nobody pressed submit on looks identical to a day
 * nobody planned.
 */
export function DayReport({
  items,
  note,
  closed,
  filed,
}: {
  items: DayItem[];
  note: string | null;
  /** The day has been closed off — eod_at is set. */
  closed: boolean;
  /** The plan was filed — sod_at is set. */
  filed: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState("");
  const [noteText, setNoteText] = useState(note ?? "");

  const answered = items.filter((i) => i.done !== null).length;
  const achieved = items.filter((i) => i.done === true).length;

  function run(
    fn: () => Promise<{ ok: boolean; error?: string; unanswered?: number }>,
    ok?: string,
  ) {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        if (ok) toast.success(ok);
        router.refresh();
        return;
      }

      // The count comes from the SERVER, not from what this component thinks
      // it is showing. Another tab, or a stale page, and the two disagree —
      // the one that refused the close is the one telling the truth.
      if (res.error === "unanswered" && res.unanswered) {
        const n = res.unanswered;
        toast.error(
          `${n} still unanswered. Mark ${n === 1 ? "it" : "each one"} done or ` +
            "not done — not done is a fine answer.",
        );
        return;
      }

      toast.error(MESSAGES[res.error ?? "generic"] ?? MESSAGES.generic);
    });
  }

  return (
    <div className="space-y-6">
      {/* ---------- the plan ---------- */}
      <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">What you are working on today</h2>
          {filed ? (
            <span className="text-xs text-fg-muted">
              {items.length} item{items.length === 1 ? "" : "s"}
              {answered > 0 ? ` · ${achieved} of ${items.length} done` : ""}
            </span>
          ) : null}
        </div>

        {items.length === 0 ? (
          <p className="mt-2 text-xs leading-relaxed text-fg-muted">
            Write what you plan to do today, one line each. You answer the same
            list at the end of the day — that is the end-of-day report.
          </p>
        ) : null}

        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-border bg-bg p-3"
            >
              <div className="flex items-start gap-3">
                <p className="min-w-0 flex-1 text-sm">{item.plan}</p>

                {/* Three states, and the third is not a tidier version of
                    "no". Unanswered has to stay visibly different from done
                    and from not done, or an unfinished report reads as a
                    finished one. */}
                <div className="flex shrink-0 gap-1">
                  <Answer
                    on={item.done === true}
                    label="Done"
                    tone="up"
                    disabled={pending || closed}
                    onClick={() =>
                      run(() => answerItem(item.id, item.done === true ? null : true))
                    }
                  >
                    <Check className="size-3.5" aria-hidden="true" />
                  </Answer>
                  <Answer
                    on={item.done === false}
                    label="Not done"
                    tone="down"
                    disabled={pending || closed}
                    onClick={() =>
                      run(() => answerItem(item.id, item.done === false ? null : false))
                    }
                  >
                    <Minus className="size-3.5" aria-hidden="true" />
                  </Answer>
                  {!closed ? (
                    <button
                      type="button"
                      aria-label={`Remove "${item.plan}"`}
                      disabled={pending}
                      onClick={() => run(() => removePlanItem(item.id))}
                      className="rounded-lg border border-border px-2 py-1.5 text-fg-subtle transition-colors hover:text-fg disabled:opacity-50"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </div>

              {item.done === false ? (
                <OutcomeBox
                  id={item.id}
                  value={item.outcome ?? ""}
                  disabled={pending || closed}
                  onSave={(text) => run(() => answerItem(item.id, false, text))}
                />
              ) : null}
            </li>
          ))}
        </ul>

        {!closed ? (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.trim()) return;
              const text = draft;
              setDraft("");
              run(() => addPlanItem(text));
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add something you are working on"
              className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={pending || !draft.trim()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add
            </button>
          </form>
        ) : null}
      </section>

      {/* ---------- the day as a whole ---------- */}
      <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <h2 className="text-sm font-medium">Anything else about today</h2>
        <p className="mt-1 text-xs text-fg-muted">
          Optional. Blocked on someone, a meeting that ate the morning, half a
          day off.
        </p>
        <textarea
          value={noteText}
          disabled={closed}
          onChange={(e) => setNoteText(e.target.value)}
          onBlur={() => {
            if ((note ?? "") !== noteText) run(() => saveNote(noteText));
          }}
          rows={3}
          className="mt-3 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm disabled:opacity-60"
        />
      </section>

      {/* ---------- closing the day ---------- */}
      <div className="flex flex-wrap items-center gap-3">
        {closed ? (
          <>
            <p className="text-sm text-fg-muted">
              Day closed — {achieved} of {items.length} done.
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => reopenDay(), "Reopened.")}
              className="rounded-lg border border-border px-3 py-2 text-sm text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
            >
              Reopen
            </button>
          </>
        ) : (
          <>
            {/* NOT DISABLED while things are unanswered, and no standing
                hint under it. A line that sits there all afternoon saying "1
                still unanswered" is read once and then becomes furniture; the
                answer belongs at the moment somebody actually tries to close
                the day, which is the moment they care. The server refuses and
                the toast says why — see run(). */}
            <button
              type="button"
              disabled={pending || items.length === 0}
              onClick={() => run(() => closeDay(), "Day closed off.")}
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-[#0A0A0A] disabled:opacity-50 sm:w-auto"
            >
              Close off the day
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Answer({
  on,
  label,
  tone,
  disabled,
  onClick,
  children,
}: {
  on: boolean;
  label: string;
  tone: "up" | "down";
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const active =
    tone === "up"
      ? "border-chart-up bg-chart-up/10 text-chart-up"
      : "border-chart-down bg-chart-down/10 text-chart-down";
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border px-2 py-1.5 transition-colors disabled:opacity-50 ${
        on ? active : "border-border text-fg-subtle hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

/** Why it did not happen. Only shown once "not done" is the answer. */
function OutcomeBox({
  id,
  value,
  disabled,
  onSave,
}: {
  id: string;
  value: string;
  disabled: boolean;
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState(value);
  return (
    <input
      id={`outcome-${id}`}
      value={text}
      disabled={disabled}
      placeholder="What happened? (optional)"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== value) onSave(text);
      }}
      className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-xs disabled:opacity-60"
    />
  );
}

const MESSAGES: Record<string, string> = {
  signed_out: "You are signed out. Sign in and try again.",
  forbidden: "This section is for staff.",
  too_short: "Write a little more than that.",
  too_long: "That is too long for one line — split it into two.",
  no_plan: "Add what you worked on first. There is nothing to report against.",
  unanswered: "Some items are still unanswered. Mark each done or not done.",
  generic: "That did not save. Try again.",
};
