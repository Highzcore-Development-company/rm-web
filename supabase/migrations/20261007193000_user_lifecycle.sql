-- ---------------------------------------------------------------------------
-- A6 + A7 — disabling and deleting an investor.
--
-- A6 is reversible, so it records enough to restore: who disabled them, when,
-- why, and the status they held. A re-enable that guesses the previous state
-- is not a restore.
--
-- A7 is irreversible, so it is a SOFT DELETE that anonymises the person and
-- keeps the money.
--
--   The spec asked for a decision and for it to be written down, so: deleting
--   the rows would destroy the financial history A9 reports and the receipts we
--   are expected to keep. A receipt naming nobody is still a valid record of a
--   payment; a payment that never happened is a hole in the books. So personal
--   data goes and subscriptions stay, with the investor row surviving as the
--   anchor the money rows point at.
--
--   What is destroyed: email (replaced in auth), MT5 login, verification and
--   acknowledgement timestamps, API keys.
--   What survives: subscriptions, crypto invoices, receipts, audit entries.
--
-- Additive and safe to re-run.
-- ---------------------------------------------------------------------------

alter table investors
  -- A6
  add column if not exists disabled_at timestamptz,
  add column if not exists disabled_by uuid references auth.users(id),
  add column if not exists disabled_reason text,
  -- The status to put back. Null while active; set at the moment of disabling.
  add column if not exists status_before_disable investor_status,
  -- A7
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id);

comment on column investors.status_before_disable is
  'Status held at the moment of disabling, so re-enabling restores rather than guesses.';
comment on column investors.deleted_at is
  'Soft delete. Personal data is anonymised; subscriptions and receipts are kept.';

create index if not exists investors_disabled_idx on investors (disabled_at)
  where disabled_at is not null;
create index if not exists investors_deleted_idx on investors (deleted_at)
  where deleted_at is not null;


-- ---------------------------------------------------------------------------
-- Disable.
--
-- Pauses rather than consumes the subscription: time spent disabled is added
-- back on re-enable. Someone barred for ten days has not had ten days of the
-- thing they paid for, and quietly keeping that money would be taking it.
-- ---------------------------------------------------------------------------

create or replace function disable_investor(
  p_investor_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status investor_status;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A reason is required to disable an investor.';
  end if;

  select status into v_status from investors where id = p_investor_id for update;
  if not found then
    raise exception 'No such investor: %', p_investor_id;
  end if;

  -- Already disabled: leave the original reason and timestamp alone rather
  -- than overwriting who did it first.
  if exists (select 1 from investors where id = p_investor_id and disabled_at is not null) then
    return;
  end if;

  update investors
     set disabled_at = now(),
         disabled_by = auth.uid(),
         disabled_reason = p_reason,
         status_before_disable = v_status,
         -- Detaches them from the bot. The status the investor page reads is
         -- the same one shouldTrade() consults, so this stops trading.
         status = 'suspended'
   where id = p_investor_id;
end;
$$;


create or replace function enable_investor(p_investor_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous investor_status;
  v_disabled_at timestamptz;
  v_paused interval;
begin
  select status_before_disable, disabled_at
    into v_previous, v_disabled_at
    from investors
   where id = p_investor_id
     for update;

  if v_disabled_at is null then
    return;
  end if;

  v_paused := now() - v_disabled_at;

  -- Give back the time. Only confirmed terms that had not already expired
  -- before the disable: extending an already-dead subscription would be
  -- inventing entitlement rather than restoring it.
  update subscriptions
     set expires_at = expires_at + v_paused
   where investor_id = p_investor_id
     and status = 'confirmed'
     and expires_at > v_disabled_at;

  update investors
     set status = coalesce(v_previous, 'pending'),
         disabled_at = null,
         disabled_by = null,
         disabled_reason = null,
         status_before_disable = null
   where id = p_investor_id;
end;
$$;


-- ---------------------------------------------------------------------------
-- Soft delete.
--
-- Anonymises in one statement so there is no window where half the personal
-- data is gone. The auth account is handled separately by the caller, which
-- also bans sign-in — this function owns the database side only.
-- ---------------------------------------------------------------------------

create or replace function soft_delete_investor(p_investor_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update investors
     set deleted_at = now(),
         deleted_by = auth.uid(),
         status = 'suspended',
         -- Personal data goes. The row stays because the money rows reference
         -- it, and an orphaned payment is worse than an anonymous one.
         vantage_account_id = null,
         linked_at = null,
         email_verified_at = null,
         risk_acknowledged_at = null
   where id = p_investor_id
     and deleted_at is null;

  -- Keys are credentials, not history. A deleted account must not keep a
  -- working one.
  update api_keys
     set revoked_at = now()
   where investor_id = p_investor_id
     and revoked_at is null;
end;
$$;

revoke all on function disable_investor(uuid, text) from public, anon, authenticated;
revoke all on function enable_investor(uuid) from public, anon, authenticated;
revoke all on function soft_delete_investor(uuid) from public, anon, authenticated;

comment on function disable_investor(uuid, text) is
  'Reversible. Records who, when and why, and pauses the subscription rather than consuming it.';
comment on function soft_delete_investor(uuid) is
  'Irreversible. Anonymises personal data; subscriptions, invoices and receipts are kept.';


-- ---------------------------------------------------------------------------
-- Admins read every investor; the permission decides which admins.
-- ---------------------------------------------------------------------------

drop policy if exists "investors admin all" on investors;
create policy "investors admin all" on investors
  for all to authenticated
  using (admin_has('users.view'))
  with check (admin_has('users.edit'));

drop policy if exists "subscriptions admin all" on subscriptions;
create policy "subscriptions admin all" on subscriptions
  for all to authenticated
  using (admin_has('finance.view') or admin_has('users.view'))
  with check (admin_has('users.edit'));
