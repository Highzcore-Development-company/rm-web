-- ---------------------------------------------------------------------------
-- P2-107 — the investors table and its RLS.
--
-- One row per person who has signed up at highzcore.com. The row is created at
-- signup and tracks them through linking a Vantage account to being traded.
--
-- WHAT THIS TABLE IS NOT: it holds no money, no balance and no credentials.
-- The investor's funds are with Vantage in their own name, and their MT5
-- password is never sent to us. The only thing stored here that identifies
-- their broker account is the login number, which is not a secret and cannot
-- be used to trade or withdraw on its own.
--
-- Additive and safe to re-run. Nothing existing is altered.
-- ---------------------------------------------------------------------------

-- Status is a closed set, so it is an enum rather than free text. A typo in a
-- status is the kind of bug that silently stops someone's account being traded
-- — or silently keeps trading one that should have stopped.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'investor_status') then
    create type investor_status as enum (
      'pending',    -- signed up, email verified, nothing linked yet
      'linked',     -- claimed a Vantage account, admin has confirmed it
      'active',     -- linked AND paid up: the bot trades this account
      'suspended'   -- detached, expired or stopped. The bot must not trade it.
    );
  end if;
end$$;

create table if not exists investors (
  id uuid primary key default gen_random_uuid(),

  -- auth.users, NOT public.users. public.users is the company site's table,
  -- populated by its own trigger; see db/migrations/README.md. Being an
  -- investor is defined by having a row here and nowhere else.
  user_id uuid not null unique references auth.users(id) on delete cascade,

  status investor_status not null default 'pending',

  -- Their MT5 login at Vantage. Unique: one broker account cannot be claimed
  -- by two subscribers. Without this, two people could each pay $20 and point
  -- at the same account, or one person could claim an account that is not
  -- theirs and see its activity.
  vantage_account_id text unique,

  -- When an admin confirmed the link against the Vantage MAM panel (P2-204).
  linked_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A linked or active investor must actually have a confirmed account. This
  -- is the constraint that stops a bad UPDATE leaving someone 'active' with
  -- nothing attached, which would read as "the bot is trading for them" on
  -- every screen we build.
  constraint investors_linked_has_account check (
    status in ('pending', 'suspended')
    or (vantage_account_id is not null and linked_at is not null)
  ),

  -- MT5 logins are numeric. Loose on length deliberately — if Vantage issues
  -- something outside this range, relax the bound rather than let a typo
  -- through silently.
  constraint investors_account_id_format check (
    vantage_account_id is null or vantage_account_id ~ '^[0-9]{4,15}$'
  )
);

comment on table investors is
  'One row per highzcore.com subscriber. Holds no funds and no broker credentials.';
comment on column investors.vantage_account_id is
  'Investor''s MT5 login at Vantage. Not a secret; cannot trade or withdraw on its own.';
comment on column investors.status is
  'pending -> linked -> active; suspended is terminal until an admin re-links.';

-- The admin screens list by status, and the link-verification queue (P2-204)
-- reads pending claims.
create index if not exists investors_status_idx on investors (status);
create index if not exists investors_created_at_idx on investors (created_at desc);

-- set_updated_at() already exists in this project (company site schema.sql).
-- Reused rather than redefined so there is one implementation, not two.
drop trigger if exists trg_investors_updated_at on investors;
create trigger trg_investors_updated_at
  before update on investors
  for each row execute function set_updated_at();


-- ---------------------------------------------------------------------------
-- RLS — an investor can read only their own row.
-- ---------------------------------------------------------------------------

alter table investors enable row level security;

-- Supabase grants broad table privileges to anon/authenticated by default.
-- Revoke first, then grant back only the columns an investor may touch. RLS
-- controls WHICH ROWS; grants control WHICH COLUMNS, and we need both — a
-- row-level policy alone would let someone set their own status to 'active'.
revoke all on investors from anon, authenticated;

grant select on investors to authenticated;
grant insert (user_id) on investors to authenticated;
grant update (vantage_account_id) on investors to authenticated;

drop policy if exists "investors self read" on investors;
create policy "investors self read" on investors
  for select to authenticated
  using (user_id = auth.uid() or is_admin());

-- Signup creates the row. Status and account are not settable here: the column
-- grant above omits them, so they take their defaults no matter what the
-- client sends.
drop policy if exists "investors self insert" on investors;
create policy "investors self insert" on investors
  for insert to authenticated
  with check (user_id = auth.uid());

-- Claiming a Vantage account (P2-203). The investor may write the login; only
-- an admin confirms it, which is a status change and therefore not reachable
-- from here. An account already confirmed cannot be swapped out underneath us.
drop policy if exists "investors self claim account" on investors;
create policy "investors self claim account" on investors
  for update to authenticated
  using (user_id = auth.uid() and linked_at is null)
  with check (user_id = auth.uid());

-- Admins see and manage everything. is_admin() is the company site's helper and
-- reads public.users.role — so a highzcore.tech admin is an admin here too.
-- That is a real coupling and it is deliberate: it is one company and one admin
-- group. If the two ever need to diverge, this policy is the place to split it.
drop policy if exists "investors admin all" on investors;
create policy "investors admin all" on investors
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- Nothing here is public. The performance page (E4) publishes the master
-- account's record, never an investor's.
