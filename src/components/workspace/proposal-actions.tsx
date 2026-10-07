'use client';

// Approve or reject a setup — here, and nowhere else.
//
// This used to be a pair of buttons on the Telegram alert. It is not any more,
// and the reason is the whole point: a tap in a chat is attributable to a chat
// account at best, and shared phones and forwarded messages make even that
// soft. "Who approved this trade" has to be answerable by name weeks later, so
// the answer is given where there is a signed-in session behind it —
// decideProposalAction stamps decided_by with the account that clicked.
//
// It also shows the one thing that can kill a setup while it waits, BEFORE
// the button rather than as a failure afterwards: the shelf life. Twelve bars
// from the signal bar, and the bot marks it missed even if someone then says
// yes. Being told "too late" after pressing approve is what makes people stop
// trusting the flow.
//
// What it does NOT do is judge where price is relative to the level. A limit
// rests where price has not got to YET; that price traded there at some point
// in the past is how the level was found in the first place, not a fault. The
// distance is stated and the decision is left to the person making it.

import { useState, useTransition } from 'react';
import { Check, X, Loader2, AlertTriangle } from 'lucide-react';
import { useNow } from '@/components/workspace/bot-bits';
import { decideProposalAction } from '@/lib/workspace/actions';

/** 12 bars of M15, mirroring PENDING_EXPIRY_BARS in the bot. Kept in sync by
 *  hand: the bot does not publish the deadline, so this is the one number here
 *  that could drift from it. */
const SHELF_LIFE_MS = 12 * 15 * 60_000;

export function ProposalActions({
  id, level, price, barTime, side,
}: {
  id: string;
  level: number | null;
  price: number | null;
  barTime: string | null;
  /** Which way the limit rests — it decides which side of price is valid. */
  side: 'buy' | 'sell';
}) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  /* Settled HERE, the moment the server says yes.
   *
   * router.refresh() re-runs the whole page — nine queries — so there is a
   * visible gap between the decision landing and the card going away. In
   * that gap the card still showed Approve, which invites a second click on
   * a proposal that is no longer pending. The answer is recorded locally so
   * the buttons go at once; the refresh then catches up in its own time. */
  const [settled, setSettled] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');

  // One ticking clock rather than Date.now() in render: the countdown has to
  // move on its own, and reading the wall clock while rendering makes the
  // output depend on when React happened to paint.
  const now = useNow(30_000);
  const age = barTime ? now - new Date(barTime).getTime() : 0;
  const expired = barTime != null && age > SHELF_LIFE_MS;
  const minsLeft = Math.max(0, Math.round((SHELF_LIFE_MS - age) / 60_000));

  // How far price is from the level, stated plainly. Which side of it price
  // sits on is information, not a verdict.
  const away = level != null && price != null ? Math.abs(price - level) : null;

  /* PRICE HAS GONE THROUGH THE LEVEL.
   *
   * A limit has to rest on the correct side of the market — a buy below it, a
   * sell above it. Once price crosses the level the broker refuses the order
   * outright, so approving can only ever come back "TOO LATE". The bot applies
   * this same rule (pending_price_is_valid); showing it here means you are not
   * offered a decision that cannot be carried out.
   *
   * The comment above about not judging the level still holds for the case it
   * was written about: price having traded there in the PAST is how the level
   * was found. This is about where price is NOW. */
  const passed = level != null && price != null
    && (side === 'buy' ? price <= level : price >= level);

  const dead = expired || passed;

  const [, startTransition] = useTransition();

  /* INSIDE A TRANSITION, and the refresh comes back with the action.
   *
   * decideProposalAction calls refresh() (next/cache) on the server, so the
   * new desk payload rides home in the action's OWN response — one round trip
   * instead of the action plus a separate router.refresh(). Starting it in a
   * transition is what keeps the buttons disabled until that payload has
   * actually been applied, rather than the instant the write returned. */
  const decide = (approved: boolean) => {
    setError(null);
    setBusy(approved ? 'approve' : 'reject');
    startTransition(async () => {
      try {
        const res = await decideProposalAction(
          id, approved, approved ? undefined : note.trim() || undefined,
        );
        if (!res.ok) { setError(res.error); return; }
        setRejecting(false);
        setSettled(approved ? 'approve' : 'reject');
      // A THROW, not an !ok — requireSection('trading-bot') throws rather than
      // returning, so without this the promise rejected unhandled, the button
      // went back to idle, and nothing on screen said why.
      } catch (e: unknown) {
        setError(e instanceof Error && e.message ? e.message : 'Could not record that. Try again.');
      } finally {
        setBusy(null);
      }
    });
  };

  if (settled) {
    return (
      <p className="text-[11px] font-semibold text-brand">
        {settled === 'approve' ? 'Approved' : 'Rejected'} · recorded against your account.
        <span className="ml-1 font-normal text-fg-subtle">
          {settled === 'approve'
            ? 'The bot places it on its next cycle.'
            : 'Nothing was placed.'}
        </span>
      </p>
    );
  }

  return (
    // No border or background of its own: it lives inside the proposal's card
    // now, and a second bordered box in there read as a separate control that
    // happened to sit underneath the one it belongs to.
    <div>
      {expired ? (
        <p className="text-[11px] leading-relaxed text-warning">
          Past its shelf life — the bot will not place this now, even if approved.
        </p>
      ) : passed ? (
        <p className="text-[11px] leading-relaxed text-warning">
          Price has moved through this level, so the broker would refuse the order —
          approving it could only come back “too late”. The bot removes it within a
          cycle. Nothing is at risk.
        </p>
      ) : (
        <p className="text-[11px] text-fg-subtle">
          {minsLeft > 0 ? `${minsLeft} min left to answer` : 'answer now'}
          {away != null && (
            <span className="font-mono"> · {away.toFixed(away < 1 ? 5 : 3)} from the level</span>
          )}
        </p>
      )}

      {!dead && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy != null}
            onClick={() => decide(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-brand px-3 text-xs font-bold text-brand-fg hover:bg-brand-hover disabled:opacity-40"
          >
            {busy === 'approve'
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Check className="h-3.5 w-3.5" />}
            {busy === 'approve' ? 'Approving…' : 'Approve'}
          </button>
          <button
            type="button"
            disabled={busy != null}
            onClick={() => (rejecting ? decide(false) : setRejecting(true))}
            className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-danger/40 px-3 text-xs font-bold text-danger hover:bg-danger/10 disabled:opacity-40"
          >
            {busy === 'reject'
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <X className="h-3.5 w-3.5" />}
            {busy === 'reject' ? 'Rejecting…' : rejecting ? 'Confirm reject' : 'Reject'}
          </button>
        </div>
      )}

      {/* A reason is optional but asked for: "it bought into resistance at
          1.2840" is the shape that fixes the bot later; "no" teaches nobody. */}
      {rejecting && !dead && (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why? (optional — it becomes the record)"
          className="mt-2 w-full rounded-sm border border-border bg-bg-elevated px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-subtle focus:border-brand focus:outline-none"
        />
      )}

      <p className="mt-2 text-[10px] text-fg-subtle">
        Recorded against your account.
      </p>

      {/* A FAILED DECISION HAS TO INTERRUPT.
          This was one line of small red text at the bottom of a card, in a
          scrolling list, under a button that had already gone back to idle —
          which is indistinguishable from nothing having happened. A decision
          not to place a trade that silently did not register is the worst
          failure this screen has, so it takes the middle of the screen and
          waits to be dismissed. */}
      {error && (
        <div
          role="alertdialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-center justify-center p-6"
        >
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setError(null)}
            className="absolute inset-0 cursor-default bg-black/60"
          />
          <div className="relative w-full max-w-[380px] rounded-sm border border-danger/40 bg-bg-elevated p-5 shadow-xl">
            <p className="flex items-center gap-2 text-sm font-bold text-danger">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Not recorded
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-fg">{error}</p>
            <p className="mt-2 text-[11px] leading-relaxed text-fg-subtle">
              Nothing was sent to the broker. The setup is unchanged — try again,
              or check whether someone else has already answered it.
            </p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="mt-4 w-full rounded-sm bg-surface-hover py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-brand/15 hover:text-brand"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
