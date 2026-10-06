-- ---------------------------------------------------------------------------
-- P2-506 — notification preferences.
--
-- Four things we email about, each independently switchable. Defaults are ON,
-- because someone whose account has started trading, or whose bot has stopped,
-- should hear about it unless they have said otherwise.
--
-- The exception is deliberate and worth stating: there is no switch for
-- billing or security email. A receipt and an expiry warning are not marketing,
-- and an opt-out that silently stops someone being told their subscription
-- lapsed would be a trap.
--
-- Additive and safe to re-run.
-- ---------------------------------------------------------------------------

create table if not exists notification_preferences (
  -- One row per investor; the investor id IS the key. A second row for the
  -- same person would mean two answers to the same question.
  investor_id uuid primary key references investors(id) on delete cascade,

  trade_opened boolean not null default true,
  trade_closed boolean not null default true,
  subscription_expiring boolean not null default true,
  bot_switched_off boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table notification_preferences is
  'Per-investor email switches. Absent row means defaults (all on).';

drop trigger if exists trg_notification_preferences_updated_at
  on notification_preferences;
create trigger trg_notification_preferences_updated_at
  before update on notification_preferences
  for each row execute function set_updated_at();


-- ---------------------------------------------------------------------------
-- RLS — an investor manages only their own preferences.
-- ---------------------------------------------------------------------------

alter table notification_preferences enable row level security;

revoke all on notification_preferences from anon, authenticated;

-- Unlike every other table here, the investor genuinely owns this data and
-- writes it themselves. There is nothing on it we need to protect from them.
grant select, insert, update on notification_preferences to authenticated;

create or replace function owns_investor(p_investor_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from investors i
     where i.id = p_investor_id and i.user_id = auth.uid()
  );
$$;

drop policy if exists "notification_preferences self" on notification_preferences;
create policy "notification_preferences self" on notification_preferences
  for all to authenticated
  using (owns_investor(investor_id) or is_admin())
  with check (owns_investor(investor_id));

-- Admins may read to answer "why did they not get the email", but must not
-- flip somebody's switches for them: the WITH CHECK above has no is_admin().
