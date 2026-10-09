-- ---------------------------------------------------------------------------
-- Staff accounts: invited, approved, role-assigned, and logged.
--
-- THE PROBLEM THIS FIXES. Until now an admin WAS an investor. is_admin()
-- joined `investors` to read email_verified_at, so every colleague needed a
-- customer record to hold any permission at all. Staff therefore appeared in
-- the user list, the renewal queue and the headcounts, indistinguishable from
-- people paying us $20 a month. Two different kinds of person sharing one
-- table is how a colleague gets chased for a renewal.
--
-- Staff and customers now share only auth.users — one login system, as
-- Supabase requires — and nothing else. app_admins is the staff record and
-- carries its own verification, so a staff member needs no investors row.
--
-- THREE THINGS ADDED:
--
--   admin_invitations  an admin invites an address. The invite carries the
--                      role and expires. Nobody becomes staff by signing up.
--   app_admins.*       accepted_at and email_verified_at, so staff identity
--                      stands on its own.
--   admin_logins       an append-only record of staff sign-ins.
--
-- The token is stored HASHED, like api_keys and email_verifications. An invite
-- link is a credential: anyone holding it becomes staff with the role baked
-- in, so the database must not hold anything that can be replayed if it leaks.
--
-- Additive and safe to re-run.
-- ---------------------------------------------------------------------------

alter table app_admins
  -- When they accepted the invitation. Null means invited but not yet in.
  add column if not exists accepted_at timestamptz,
  -- Proof they received mail at their own address. Set by accepting the
  -- invite, which is only possible from the emailed link.
  add column if not exists email_verified_at timestamptz,
  add column if not exists invited_by uuid references auth.users(id),
  add column if not exists last_login_at timestamptz,
  add column if not exists login_count integer not null default 0;

comment on column app_admins.email_verified_at is
  'Staff verification, independent of investors.email_verified_at. Set by '
  'accepting an emailed invitation, which proves the address without '
  'requiring the person to be a customer.';

-- Everyone who is already an admin stays one. Without this the migration
-- locks out every existing admin the moment is_admin() stops reading
-- investors, including whoever would have to fix it.
update app_admins a
   set accepted_at = coalesce(a.accepted_at, a.created_at, now()),
       email_verified_at = coalesce(
         a.email_verified_at,
         (select i.email_verified_at from investors i where i.user_id = a.user_id),
         a.created_at,
         now()
       )
 where a.accepted_at is null or a.email_verified_at is null;


-- ---------------------------------------------------------------------------
-- Invitations.
-- ---------------------------------------------------------------------------

create table if not exists admin_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null references admin_roles(name),
  -- SHA-256 of the token. Never the token itself.
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  -- Short on purpose: this grants staff access, and an invite left open for
  -- weeks in somebody's inbox is a credential nobody is watching.
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  revoked_at timestamptz
);

comment on table admin_invitations is
  'Pending staff invitations. One row per invite; the token is stored hashed '
  'because the link itself is a credential that creates staff.';

-- One live invitation per address. A second invite for the same person would
-- otherwise leave two valid links with possibly different roles, and which
-- one they clicked decides their permissions.
create unique index if not exists admin_invitations_one_live
  on admin_invitations (lower(email))
  where accepted_at is null and revoked_at is null;

create index if not exists admin_invitations_email_idx
  on admin_invitations (lower(email));

alter table admin_invitations enable row level security;
revoke all on admin_invitations from anon, authenticated;


-- ---------------------------------------------------------------------------
-- Login activity.
--
-- Append-only: no update or delete policy and none granted. A sign-in record
-- that can be edited answers nothing when it matters.
-- ---------------------------------------------------------------------------

create table if not exists admin_logins (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- auth.users.last_sign_in_at at the moment we noticed. Also the idempotency
  -- key: the same sign-in seen on twenty page loads records once.
  signed_in_at timestamptz not null,
  seen_at timestamptz not null default now(),
  unique (user_id, signed_in_at)
);

comment on table admin_logins is
  'One row per staff sign-in. Unique on (user_id, signed_in_at) so repeated '
  'page loads within one session cannot inflate it.';

create index if not exists admin_logins_recent_idx
  on admin_logins (user_id, signed_in_at desc);

alter table admin_logins enable row level security;
revoke all on admin_logins from anon, authenticated;


-- ---------------------------------------------------------------------------
-- Staff identity no longer depends on being a customer.
--
-- Both functions previously joined `investors` for email_verified_at. They now
-- read app_admins' own column, so a staff member needs no investor row — and
-- an admin who has been invited but has not accepted holds nothing yet.
-- ---------------------------------------------------------------------------

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from app_admins a
     where a.user_id = auth.uid()
       and a.disabled_at is null
       and a.accepted_at is not null
       and a.email_verified_at is not null
  );
$$;

comment on function is_admin() is
  'True when the caller is enabled staff who accepted their invitation and '
  'verified their address. Reads app_admins only: staff are not customers and '
  'must not need an investors row.';

create or replace function admin_has(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from app_admins a
      join admin_roles r on r.name = a.role
     where a.user_id = auth.uid()
       -- A disabled admin holds nothing, whatever their role says.
       and a.disabled_at is null
       -- Nor does one who has not accepted, or not verified.
       and a.accepted_at is not null
       and a.email_verified_at is not null
       and (r.is_super or p_permission = any(r.permissions))
  );
$$;

comment on function admin_has(text) is
  'True when the caller holds this permission. Super admin holds all. '
  'Disabled, unaccepted and unverified staff hold none. Matches getAdmin() in '
  'src/lib/admin.ts — if one changes, change both.';
