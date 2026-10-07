-- ---------------------------------------------------------------------------
-- Refunds — RECORDED, not processed.
--
-- Victor's ruling: refunds stay a manual bank transfer for now, but they must
-- be recorded against the subscription so the financial overview does not
-- drift from reality. Without this, a refunded month is still counted as
-- revenue forever and the figure quietly overstates every month it happened in.
--
-- So this adds a record and nothing else. There is deliberately no refund
-- FLOW: nothing here moves money, calls a provider, or alters an entitlement.
-- It is a note that money went back out, with an amount and a reason.
--
-- The amount is in USD cents, like every other amount in this schema, and is
-- capped at what was actually charged — a refund larger than the payment is
-- not a refund, it is a typo or a fraud, and neither should be storable.
--
-- Additive and safe to re-run.
-- ---------------------------------------------------------------------------

alter table subscriptions
  add column if not exists refunded_usd integer,
  add column if not exists refunded_at timestamptz,
  add column if not exists refunded_reason text,
  -- The ADMIN who recorded it. Not a foreign key to auth.users: that table is
  -- in another schema and this is an audit note, not a relationship we join.
  add column if not exists refunded_by text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'subscriptions_refund_within_amount'
  ) then
    alter table subscriptions
      add constraint subscriptions_refund_within_amount check (
        refunded_usd is null
        or (refunded_usd > 0 and refunded_usd <= amount_usd)
      );
  end if;

  -- An amount with no date, or a date with no amount, is a half-written
  -- record that would read as either depending on which column you looked at.
  if not exists (
    select 1 from pg_constraint where conname = 'subscriptions_refund_complete'
  ) then
    alter table subscriptions
      add constraint subscriptions_refund_complete check (
        (refunded_usd is null and refunded_at is null)
        or (refunded_usd is not null and refunded_at is not null)
      );
  end if;
end$$;

-- Investors see their own refund on their receipt. They may read it; only the
-- service role writes it, exactly as with every other money column here.
do $$
begin
  if exists (
    select 1 from information_schema.column_privileges
    where table_name = 'subscriptions'
      and grantee = 'authenticated'
      and privilege_type = 'SELECT'
      and column_name = 'amount_usd'
  ) then
    grant select (refunded_usd, refunded_at, refunded_reason)
      on subscriptions to authenticated;
  end if;
end$$;

comment on column subscriptions.refunded_usd is
  'USD cents returned to the payer, by manual bank transfer outside the '
  'platform. Recorded so revenue figures net it off. Does NOT shorten the '
  'entitlement — if a refund should also end access, an admin changes the '
  'expiry, deliberately and visibly.';
