-- ---------------------------------------------------------------------------
-- P2-306 / P2-307 — USDT TRC-20 invoices.
--
-- Follows the MYPOKER deposit pattern: one HD-derived address per invoice,
-- never reused, credited only on N confirmations from the accepted contract.
--
-- WHY AN ADDRESS IS NEVER REUSED. If two invoices share an address, a transfer
-- arriving against it cannot be attributed to one of them — and the usual
-- outcome is crediting the wrong invoice, or the same payment twice. Reuse also
-- publishes the payment history of every previous payer to the next one, since
-- the chain is public.
--
-- THE SEED NEVER REACHES THIS APPLICATION. Addresses are derived from the
-- account-level PUBLIC xpub. Deriving a receive address needs no private key.
-- Moving the funds does, and that happens in a separate sweep process with its
-- own key custody — not here, and not in the web app's environment.
--
-- Additive and safe to re-run.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'crypto_invoice_status') then
    create type crypto_invoice_status as enum (
      'awaiting',   -- address issued, nothing seen on chain
      'seen',       -- a transfer is visible but not yet confirmed. Grants nothing.
      'confirmed',  -- confirmed, and the subscription has been activated
      'expired'     -- abandoned. The address is still never reused.
    );
  end if;
end$$;

-- Address derivation indexes come from a sequence, so two concurrent checkouts
-- can never be handed the same index and therefore the same address.
create sequence if not exists crypto_derivation_index_seq as bigint start 1;

create table if not exists crypto_invoices (
  id uuid primary key default gen_random_uuid(),

  -- One invoice per subscription row. A second attempt is a new subscription
  -- row with a new address, not a second invoice against the old one.
  subscription_id uuid not null unique
    references subscriptions(id) on delete cascade,

  derivation_index bigint not null unique
    default nextval('crypto_derivation_index_seq'),
  address text not null unique,

  -- Micro-USDT (6 decimals), integer. USDT-TRC20 has 6 decimals, so this is
  -- exact. Never a float.
  expected_micro_usdt bigint not null,
  constraint crypto_invoices_amount_positive check (expected_micro_usdt > 0),

  -- Recorded per invoice, not read from config at credit time. Config changes;
  -- what this invoice promised must not change under the payer.
  contract text not null,
  confirmations_required integer not null,
  constraint crypto_invoices_confirmations_sane check (confirmations_required >= 1),

  status crypto_invoice_status not null default 'awaiting',

  -- The sighting. Present once something lands, cleared if it never confirms.
  seen_tx_hash text,
  seen_micro_usdt bigint,
  seen_at timestamptz,

  created_at timestamptz not null default now(),
  -- An unpaid invoice stops being quotable. Expiry does not lose money: a late
  -- confirmation is still creditable, it just needs a human to look at it.
  expires_at timestamptz not null default now() + interval '2 hours',
  updated_at timestamptz not null default now(),

  constraint crypto_invoices_confirmed_has_tx check (
    status <> 'confirmed' or seen_tx_hash is not null
  )
);

-- A given on-chain transaction can satisfy at most one invoice. The same
-- guarantee subscriptions makes on provider_ref, enforced one layer earlier so
-- a duplicate event is rejected before it reaches activation.
create unique index if not exists crypto_invoices_tx_hash_key
  on crypto_invoices (seen_tx_hash)
  where seen_tx_hash is not null;

create index if not exists crypto_invoices_watch_idx
  on crypto_invoices (status, expires_at)
  where status in ('awaiting', 'seen');

comment on table crypto_invoices is
  'One HD-derived TRON address per invoice. Addresses are never reused, including after expiry.';
comment on column crypto_invoices.derivation_index is
  'HD path index. Allocated from a sequence so concurrent checkouts cannot collide.';

drop trigger if exists trg_crypto_invoices_updated_at on crypto_invoices;
create trigger trg_crypto_invoices_updated_at
  before update on crypto_invoices
  for each row execute function set_updated_at();


-- ---------------------------------------------------------------------------
-- RLS — the payer sees their own invoice (they need the address and amount).
-- Nobody but the service role writes one.
-- ---------------------------------------------------------------------------

alter table crypto_invoices enable row level security;

revoke all on crypto_invoices from anon, authenticated;
grant select on crypto_invoices to authenticated;

drop policy if exists "crypto_invoices self read" on crypto_invoices;
create policy "crypto_invoices self read" on crypto_invoices
  for select to authenticated
  using (
    is_admin()
    or exists (
      select 1
        from subscriptions s
        join investors i on i.id = s.investor_id
       where s.id = crypto_invoices.subscription_id
         and i.user_id = auth.uid()
    )
  );

drop policy if exists "crypto_invoices admin all" on crypto_invoices;
create policy "crypto_invoices admin all" on crypto_invoices
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- The sequence is driven by the service role only; an investor must not be
-- able to burn through derivation indexes.
revoke all on sequence crypto_derivation_index_seq from anon, authenticated;
