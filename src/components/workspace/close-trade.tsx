"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  readCommand,
  requestCloseTrade,
} from "@/app/(app)/app/admin/(panel)/bot/actions";

/**
 * Ask the bot to close a live trade.
 *
 * THE INSERT IS NOT THE CLOSE. We write a row to bot_commands; the bot picks
 * it up on its next loop, tries it against the broker, and writes back
 * done or failed with its reason. So this button never says "closed" on the
 * strength of the insert succeeding — it watches the row and reports what the
 * bot actually did. A success toast over a position that is still open is the
 * one failure that table exists to prevent.
 *
 * It also stays in its finished state rather than resetting. "Did that work?"
 * is the question somebody has thirty seconds later, and a button that has
 * snapped back to normal answers it with a shrug.
 */

type Phase =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "waiting"; id: string }
  | { kind: "done"; note: string | null }
  | { kind: "failed"; note: string | null };

/** How long to watch before saying so. The bot's loop is seconds, not minutes. */
const GIVE_UP_MS = 90_000;
const POLL_MS = 2_000;

export function CloseTradeButton({
  symbol,
  ticket,
  alias,
}: {
  symbol: string;
  ticket: number;
  alias: string;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const startedAt = useRef<number>(0);

  // Polls while a command is in flight. Cleared on unmount, so switching tabs
  // mid-close does not leave a timer running against a dead component.
  useEffect(() => {
    if (phase.kind !== "waiting") return;

    let live = true;
    const tick = async () => {
      const state = await readCommand(phase.id);
      if (!live) return;

      if (state && state.status !== "pending") {
        setPhase(
          state.status === "done"
            ? { kind: "done", note: state.note }
            : { kind: "failed", note: state.note },
        );
        return;
      }

      if (Date.now() - startedAt.current > GIVE_UP_MS) {
        // NOT reported as failed: the command is still queued and the bot may
        // yet act on it. Saying "failed" here would invite a second close
        // request for a position that is about to be closed once.
        setPhase({
          kind: "failed",
          note: "No answer from the bot yet. The request is still queued — check the Live list before asking again.",
        });
        return;
      }

      setTimeout(tick, POLL_MS);
    };

    const id = setTimeout(tick, POLL_MS);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [phase]);

  if (phase.kind === "done") {
    return (
      <p className="text-[11px] text-chart-up" role="status">
        Closed by the bot{phase.note ? ` — ${phase.note}` : ""}
      </p>
    );
  }

  if (phase.kind === "failed") {
    return (
      <p className="text-[11px] text-chart-down" role="alert">
        Not closed{phase.note ? ` — ${phase.note}` : ""}
      </p>
    );
  }

  if (phase.kind === "waiting") {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-fg-muted" role="status">
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
        Asked the bot to close it — waiting for it to confirm
      </p>
    );
  }

  if (phase.kind === "confirming") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {/* Names the market and the ticket. "Close this trade?" on a rail of
            near-identical rows is how the wrong one gets closed. */}
        <span className="text-[11px] text-fg-muted">
          Close {alias} #{ticket}?
        </span>
        <button
          type="button"
          onClick={() => {
            startedAt.current = Date.now();
            setPhase({ kind: "waiting", id: "" });
            void requestCloseTrade(symbol, ticket).then((res) => {
              if (res.ok) setPhase({ kind: "waiting", id: res.id });
              else
                setPhase({
                  kind: "failed",
                  note:
                    res.error === "not_connected"
                      ? "You are not signed in to the bot — connect on the Bot page."
                      : res.error === "forbidden"
                        ? "You do not have permission to do that."
                        : "The request did not reach the bot.",
                });
            });
          }}
          className="rounded border border-chart-down/60 px-2 py-1 text-[11px] font-medium transition-colors hover:border-chart-down"
        >
          Yes, close it
        </button>
        <button
          type="button"
          onClick={() => setPhase({ kind: "idle" })}
          className="px-1 py-1 text-[11px] text-fg-muted hover:text-fg"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPhase({ kind: "confirming" })}
      className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-fg-muted transition-colors hover:text-fg"
    >
      <X className="size-3" aria-hidden="true" />
      Close trade
    </button>
  );
}
