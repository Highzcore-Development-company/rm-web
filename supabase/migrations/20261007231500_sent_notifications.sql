-- ---------------------------------------------------------------------------
-- P2-506 — one row per notification actually sent.
--
-- The preferences table, the opt-out switches and the UI all shipped; the
-- SENDS never did. The switches controlled nothing, which is worse than having
-- no switches: it tells someone they have turned something off that was never
-- on.
--
-- This is the idempotency record that makes the sender safe. Same shape and
-- same reasoning as sent_reminders: the insert happens BEFORE the send, so a
-- failed send is skipped rather than retried.
--
-- That ordering is deliberate, and it matters far more here than it did for
-- reminders. A reminder fires twice a subscription; a trade notification fires
-- on every open and close across 30 markets. "Everybody gets the same trade
-- email every five minutes until someone notices" would burn a young SMTP
-- reputation in an afternoon and is not recoverable by apologising. We choose
-- to under-send.
--
-- kind:  trade_opened | trade_closed | bot_switched_off
-- ref:   what makes it unique within that kind — the bot_trades id for a
--        trade, and the timestamp of the change for the bot switch.
--
-- Deliberately NOT a foreign key to anything in rm-server: that is a different
-- Postgres instance, so the reference is a text id and cannot be enforced.
--
-- Additive and safe to re-run.
-- ---------------------------------------------------------------------------

create table if not exists sent_notifications (
  investor_id uuid not null references investors(id) on delete cascade,
  kind text not null,
  ref text not null,
  sent_at timestamptz not null default now(),
  primary key (investor_id, kind, ref)
);

comment on table sent_notifications is
  'One row per P2-506 notification sent. The primary key is the idempotency '
  'guard: the insert is attempted before the send, and a conflict means it '
  'has already gone out.';

create index if not exists sent_notifications_sent_at_idx
  on sent_notifications (sent_at desc);

alter table sent_notifications enable row level security;

-- Service role only. An investor has no reason to read the send log, and
-- nobody else has any business in it at all.
revoke all on sent_notifications from anon, authenticated;
