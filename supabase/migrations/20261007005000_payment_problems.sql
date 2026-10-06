-- ---------------------------------------------------------------------------
-- Record WHY a payment was refused.
--
-- Three ways a payment could fail silently:
--
--   1. Underpaid. Logged with console.warn and nothing else. The payer sent
--      real money, got nothing, and saw a spinner; nobody would find out
--      unless they happened to read the server output.
--   2. Wrong contract. Counted in an "ignored" tally on the job's response and
--      not attached to the invoice, so it was invisible per payer.
--   3. ALATPay reported failed. The webhook acknowledged it and recorded
--      nothing, leaving the invoice "awaiting" forever — indistinguishable
--      from a payer who simply never paid.
--
-- A refused payment is more urgent than a successful one: somebody is out of
-- pocket and waiting. It needs to be visible to them and to an admin.
--
-- Additive and safe to re-run.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_problem') then
    create type payment_problem as enum (
      'underpaid',       -- right token, not enough of it
      'wrong_contract',  -- a token that is not the one we accept
      'provider_failed'  -- ALATPay reported the transaction failed
    );
  end if;
end$$;

alter table crypto_invoices
  add column if not exists problem payment_problem,
  add column if not exists problem_detail text,
  add column if not exists problem_at timestamptz;

comment on column crypto_invoices.problem is
  'Why an arriving transfer was refused. Null means nothing has been refused.';
comment on column crypto_invoices.problem_detail is
  'Human-readable specifics — amounts, contract address — for support.';

alter table subscriptions
  add column if not exists problem payment_problem,
  add column if not exists problem_detail text;

comment on column subscriptions.problem is
  'Set when a provider refused the payment, so it is not mistaken for unpaid.';

-- The admin queue reads these.
create index if not exists crypto_invoices_problem_idx
  on crypto_invoices (problem_at desc)
  where problem is not null;
