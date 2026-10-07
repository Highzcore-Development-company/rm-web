-- ---------------------------------------------------------------------------
-- A1 + A2 — admin accounts, roles, permissions, and an audit trail.
--
-- app_admins existed as a bare list of user ids: being on it meant being an
-- admin, and every admin could do everything. This gives it roles, the ability
-- to force a password change, and a record of who did what.
--
-- Additive and safe to re-run.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Permissions.
--
-- Text rather than an enum: adding a permission to an enum needs a migration
-- and a deploy, and the set will grow as the panel does. The seeded roles
-- below are the contract; an unknown string simply grants nothing.
-- ---------------------------------------------------------------------------

create table if not exists admin_roles (
  name text primary key,
  label text not null,
  -- Empty for a role that can see nothing. Super admin ignores this entirely.
  permissions text[] not null default '{}',
  -- Implicitly holds every permission, cannot be deleted or disabled.
  is_super boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table admin_roles is
  'Admin roles and the permissions each grants. Super admin ignores the list and holds all.';

insert into admin_roles (name, label, permissions, is_super) values
  ('super_admin', 'Super admin', '{}', true),
  ('admin', 'Admin', array[
    'users.view', 'users.edit', 'users.disable',
    'bot.view', 'bot.configure',
    'finance.view'
  ], false),
  ('support', 'Support', array['users.view', 'bot.view'], false),
  ('finance', 'Finance', array['users.view', 'finance.view'], false)
on conflict (name) do nothing;


-- ---------------------------------------------------------------------------
-- Admin accounts.
-- ---------------------------------------------------------------------------

alter table app_admins
  add column if not exists role text not null default 'admin'
    references admin_roles(name),
  -- A1. Default true so a seeded or invited account cannot be used until its
  -- password has been changed. The gate is in the app layout; this is the flag
  -- it reads.
  add column if not exists must_change_password boolean not null default true,
  add column if not exists disabled_at timestamptz,
  add column if not exists disabled_by uuid references auth.users(id),
  add column if not exists disabled_reason text,
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists last_seen_at timestamptz;

comment on column app_admins.must_change_password is
  'Blocks every admin route until the password is changed. Default true: an account nobody has set a password on must not be usable.';
comment on column app_admins.role is
  'References admin_roles. Permissions come from the role, never from the row.';


-- ---------------------------------------------------------------------------
-- A super admin cannot be disabled or deleted, including by itself.
--
-- A trigger rather than a policy: the rule is about the ROW being changed, not
-- about who is changing it, and it has to hold for the service role too. Every
-- destructive path in this app runs as the service role, so a check that the
-- service role bypasses would protect nothing.
-- ---------------------------------------------------------------------------

create or replace function protect_super_admin()
returns trigger
language plpgsql
as $$
declare
  v_is_super boolean;
begin
  select r.is_super into v_is_super
    from admin_roles r
   where r.name = coalesce(old.role, 'admin');

  if not coalesce(v_is_super, false) then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    raise exception 'A super admin cannot be deleted. Change the role first.';
  end if;

  if new.disabled_at is not null and old.disabled_at is null then
    raise exception 'A super admin cannot be disabled. Change the role first.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_super_admin on app_admins;
create trigger trg_protect_super_admin
  before update or delete on app_admins
  for each row execute function protect_super_admin();


-- ---------------------------------------------------------------------------
-- The permission check.
--
-- One function, used by RLS policies AND by the server guard, so the UI and
-- the database cannot disagree about who may do what. A hidden button is not
-- a permission; this is.
-- ---------------------------------------------------------------------------

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
       and (r.is_super or p_permission = any(r.permissions))
  );
$$;

comment on function admin_has(text) is
  'True when the caller holds this permission. Super admin holds all. Disabled admins hold none.';

grant execute on function admin_has(text) to authenticated;

-- is_admin() predates roles and is used by existing policies. Redefined so a
-- DISABLED admin stops being an admin everywhere at once, rather than only in
-- the places that remembered to check.
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from app_admins
     where user_id = auth.uid()
       and disabled_at is null
  );
$$;


-- ---------------------------------------------------------------------------
-- A2 — every destructive action records who did it and when.
--
-- Append-only: no update or delete policy, and none granted to anyone. An
-- audit trail that can be edited by the people it audits is decoration.
-- ---------------------------------------------------------------------------

create table if not exists admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  -- Kept as text, not a foreign key: the actor may later be deleted and the
  -- record of what they did must survive them.
  actor_email text,
  action text not null,
  -- What was acted on. Free-form so it can name an investor, an admin, or a
  -- market without three nullable columns.
  target_type text,
  target_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_created_idx on admin_audit (created_at desc);
create index if not exists admin_audit_target_idx on admin_audit (target_type, target_id);

comment on table admin_audit is
  'Append-only record of admin actions. No update or delete path exists, by design.';

alter table admin_audit enable row level security;

revoke all on admin_audit from anon, authenticated;
grant select on admin_audit to authenticated;

drop policy if exists "admin_audit read" on admin_audit;
create policy "admin_audit read" on admin_audit
  for select to authenticated
  using (is_admin());

-- Writes go through this, never a direct insert, so an actor cannot be forged
-- by whoever composes the row.
create or replace function record_admin_action(
  p_action text,
  p_target_type text default null,
  p_target_id text default null,
  p_detail jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select email into v_email from auth.users where id = auth.uid();

  insert into admin_audit (actor_user_id, actor_email, action, target_type, target_id, detail)
  values (auth.uid(), v_email, p_action, p_target_type, p_target_id, p_detail);
end;
$$;

grant execute on function record_admin_action(text, text, text, jsonb) to authenticated;


-- ---------------------------------------------------------------------------
-- Admin management is super-admin only (admins.manage).
-- ---------------------------------------------------------------------------

grant select on app_admins to authenticated;
grant select on admin_roles to authenticated;

-- The privileges the "manage" policy below needs in order to be reachable.
-- Without them the table grant denies first and the policy never runs, which
-- looks like enforcement in the schema and is not. RLS is the enforcement;
-- the server guard is the second layer, not the only one.
grant insert, update, delete on app_admins to authenticated;

drop policy if exists "app_admins read" on app_admins;
create policy "app_admins read" on app_admins
  for select to authenticated
  using (is_admin());

drop policy if exists "app_admins manage" on app_admins;
create policy "app_admins manage" on app_admins
  for all to authenticated
  using (admin_has('admins.manage'))
  with check (admin_has('admins.manage'));

drop policy if exists "admin_roles read" on admin_roles;
create policy "admin_roles read" on admin_roles
  for select to authenticated
  using (is_admin());

-- The seed admin is promoted by the existing bootstrap trigger. Recorded here
-- so the super admin exists the moment that account does, in either order.
insert into admin_bootstrap_emails (email, note)
values (lower('admin@highzcore.tech'), 'Seed super admin')
on conflict (email) do nothing;

-- The bootstrap trigger inserts with the default role. Make sure the seed
-- address lands as super_admin whenever it appears.
create or replace function promote_bootstrap_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from admin_bootstrap_emails where email = lower(new.email)) then
    insert into app_admins (user_id, note, role, must_change_password)
    values (
      new.id,
      'promoted from admin_bootstrap_emails',
      case when lower(new.email) = 'admin@highzcore.tech' then 'super_admin' else 'admin' end,
      -- A seeded account has a password somebody else chose, and in this case
      -- one written in a spec. It is unusable until that is changed.
      true
    )
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;
