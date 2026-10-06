-- ---------------------------------------------------------------------------
-- Supporting pieces for the crypto checkout and the reminder job.
--
-- Additive and safe to re-run.
-- ---------------------------------------------------------------------------

-- Claim a derivation index.
--
-- A sequence rather than max(index)+1, because counting races: two checkouts a
-- millisecond apart both read N, both derive the same address, and two
-- unrelated invoices collect into one address. nextval is atomic and never
-- returns the same value twice, even under concurrency and even after a
-- rollback — a gap in the indexes costs nothing, a duplicate costs a payment.
create or replace function next_crypto_derivation_index()
returns bigint
language sql
security definer
set search_path = public
as $$
  select nextval('crypto_derivation_index_seq');
$$;

revoke all on function next_crypto_derivation_index()
  from public, anon, authenticated;

comment on function next_crypto_derivation_index() is
  'Atomically claims an HD index. Service role only.';


-- ---------------------------------------------------------------------------
-- P2-310 — what has already been emailed.
--
-- The reminder job runs on a schedule and may run twice. Without this a retry
-- re-sends, and someone gets the same warning four times. One row per
-- (subscription, milestone) makes sending idempotent on exactly the thing that
-- must not repeat.
-- ---------------------------------------------------------------------------

create table if not exists sent_reminders (
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  -- Days before expiry at the moment of sending: 7 or 1.
  milestone integer not null,
  sent_at timestamptz not null default now(),
  primary key (subscription_id, milestone)
);

comment on table sent_reminders is
  'One row per reminder actually sent. Makes the reminder job safe to re-run.';

alter table sent_reminders enable row level security;

-- No policies: service role only. Nobody else has any business reading it.
revoke all on sent_reminders from anon, authenticated;
