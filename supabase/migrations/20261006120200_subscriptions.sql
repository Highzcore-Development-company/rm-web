-- ---------------------------------------------------------------------------
-- P2-302 / P2-308 / P2-309 — subscriptions.
--
-- One row per TERM BOUGHT, not one row per investor. Appending a purchase
-- rather than mutating a running expiry is what makes activation idempotent:
-- a replayed webhook, a double-clicked button or a re-delivered chain event
-- cannot extend anybody twice, because the second insert violates a unique
-- constraint instead of adding a month.
--
-- The entitlement — "is this person paid up, and until when?" — is therefore
-- derived, not stored. See investor_entitlement() at the bottom.
--
-- MONEY IS INTEGER MINOR UNITS. amount_usd is cents, amount_ngn is kobo.
-- Never float: 0.1 + 0.2 is not 0.3, and these numbers go on receipts.
--
-- Additive and safe to re-run.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type payment_method as enum (
      'alatpay_transfer',  -- virtual account number, bank transfer (P2-304)
      'alatpay_card',      -- hosted card flow (P2-305)
      'usdt_trc20'         -- our own, HD address per invoice (P2-306)
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type subscription_status as enum (
      'awaiting',   -- invoice raised, money not seen yet. Grants nothing.
      'confirmed',  -- paid and verified. This is the only status that counts.
      'failed',     -- provider reported failure
      'expired'     -- invoice abandoned before payment
    );
  end if;
end$$;

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),

  investor_id uuid not null references investors(id) on delete cascade,

  months integer not null,
  constraint subscriptions_months_positive check (months >= 1),

  -- What was actually charged, in minor units, as quoted at checkout.
  amount_usd integer not null,
  constraint subscriptions_amount_usd_positive check (amount_usd > 0),

  -- P2-309 — the price is USD; NGN is shown at a stored rate. Both are
  -- recorded because the NGN figure is what a Nigerian investor actually paid
  -- and what their receipt must show. Nullable: a USDT payer has no NGN leg.
  amount_ngn bigint,
  constraint subscriptions_amount_ngn_positive check (
    amount_ngn is null or amount_ngn > 0
  ),

  -- The USD->NGN rate used, as minor-unit kobo per USD cent, scaled by 10^6 so
  -- it survives as an exact integer. Stored with the row rather than looked up
  -- later: the rate moves, and a receipt reprinted next month must show the
  -- rate that was actually charged.
  --
  -- WHO ABSORBS FX MOVEMENT (P2-309): we do, within a term. The investor is
  -- quoted and charged a fixed NGN amount at this rate; if the naira moves
  -- before they renew, the next term is quoted at the new rate. We never
  -- re-bill a term that has already been paid.
  fx_usd_ngn_e6 bigint,
  constraint subscriptions_fx_present check (
    (amount_ngn is null and fx_usd_ngn_e6 is null)
    or (amount_ngn is not null and fx_usd_ngn_e6 is not null)
  ),

  method payment_method not null,
  status subscription_status not null default 'awaiting',

  -- The provider's identifier for this payment: ALATPay transaction reference,
  -- or the TRON transaction hash. The idempotency key.
  provider_ref text,

  -- Term boundaries. Set when the payment confirms, not when it is raised —
  -- an unpaid invoice must not grant a day of access.
  starts_at timestamptz,
  expires_at timestamptz,
  constraint subscriptions_term_order check (
    expires_at is null or starts_at is null or expires_at > starts_at
  ),
  -- A confirmed row must have a term; an unconfirmed one must not.
  constraint subscriptions_confirmed_has_term check (
    (status = 'confirmed') = (starts_at is not null and expires_at is not null)
  ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- THE IDEMPOTENCY GUARANTEE (P2-307, P2-308).
--
-- One provider reference can be banked exactly once. A replayed ALATPay
-- callback or a re-delivered TRON event hits this and fails, rather than
-- quietly buying someone a second month. Partial, because rows awaiting
-- payment legitimately have no reference yet.
create unique index if not exists subscriptions_provider_ref_key
  on subscriptions (method, provider_ref)
  where provider_ref is not null;

create index if not exists subscriptions_investor_idx
  on subscriptions (investor_id, expires_at desc);
create index if not exists subscriptions_status_idx
  on subscriptions (status, created_at desc);

comment on table subscriptions is
  'One row per term bought. Entitlement is derived from the confirmed rows, never stored.';

drop trigger if exists trg_subscriptions_updated_at on subscriptions;
create trigger trg_subscriptions_updated_at
  before update on subscriptions
  for each row execute function set_updated_at();


-- ---------------------------------------------------------------------------
-- Entitlement. Derived, so it cannot drift from the payments that justify it.
-- ---------------------------------------------------------------------------

create or replace function investor_entitlement(p_investor_id uuid)
returns timestamptz
language sql
stable
security invoker
set search_path = public
as $$
  select max(expires_at)
    from subscriptions
   where investor_id = p_investor_id
     and status = 'confirmed';
$$;

comment on function investor_entitlement(uuid) is
  'Paid-up until. Null means never paid. Compare against now() for access.';


-- ---------------------------------------------------------------------------
-- Activation (P2-308). The only supported way to bank a payment.
--
-- SECURITY DEFINER because it writes columns no investor may write, and it is
-- called from a webhook or a chain watcher, not from a user session. It takes
-- the provider reference and refuses to do anything twice.
-- ---------------------------------------------------------------------------

create or replace function activate_subscription(
  p_subscription_id uuid,
  p_provider_ref text
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_investor uuid;
  v_months integer;
  v_status subscription_status;
  v_existing timestamptz;
  v_starts timestamptz;
  v_expires timestamptz;
begin
  if p_provider_ref is null or length(trim(p_provider_ref)) = 0 then
    raise exception 'activate_subscription requires a provider reference';
  end if;

  -- Lock the row: two deliveries of the same event can arrive concurrently.
  select investor_id, months, status
    into v_investor, v_months, v_status
    from subscriptions
   where id = p_subscription_id
     for update;

  if not found then
    raise exception 'no such subscription: %', p_subscription_id;
  end if;

  -- Already banked. Return the term rather than raising: the caller is a
  -- webhook being retried, and a retry succeeding is the correct outcome.
  if v_status = 'confirmed' then
    return (select expires_at from subscriptions where id = p_subscription_id);
  end if;

  -- Terms STACK, they do not overlap. Someone who renews with a month left
  -- gets that month plus the new one — starting a fresh term from today would
  -- silently take the remainder off them.
  v_existing := investor_entitlement(v_investor);
  v_starts := greatest(coalesce(v_existing, now()), now());
  v_expires := v_starts + make_interval(months => v_months);

  update subscriptions
     set status = 'confirmed',
         provider_ref = p_provider_ref,
         starts_at = v_starts,
         expires_at = v_expires
   where id = p_subscription_id;

  return v_expires;
end;
$$;

revoke all on function activate_subscription(uuid, text) from public, anon, authenticated;

comment on function activate_subscription(uuid, text) is
  'Banks a payment exactly once and returns the new expiry. Service role only.';


-- ---------------------------------------------------------------------------
-- RLS — an investor sees only their own payments, and writes none of them.
-- ---------------------------------------------------------------------------

alter table subscriptions enable row level security;

revoke all on subscriptions from anon, authenticated;
grant select on subscriptions to authenticated;

drop policy if exists "subscriptions self read" on subscriptions;
create policy "subscriptions self read" on subscriptions
  for select to authenticated
  using (
    is_admin()
    or exists (
      select 1 from investors i
       where i.id = subscriptions.investor_id
         and i.user_id = auth.uid()
    )
  );

-- No insert or update policy for investors, by design. An invoice is raised by
-- our server with the service role, after it has priced the term itself. If a
-- client could insert here it could insert months = 12, amount_usd = 1.
drop policy if exists "subscriptions admin all" on subscriptions;
create policy "subscriptions admin all" on subscriptions
  for all to authenticated
  using (is_admin())
  with check (is_admin());
