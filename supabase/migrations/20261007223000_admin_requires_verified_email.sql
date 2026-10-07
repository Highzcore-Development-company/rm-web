-- ---------------------------------------------------------------------------
-- An admin must have verified their email — in the DATABASE too.
--
-- Samuel's foundation-hardening PR made getAdmin() require email_verified_at,
-- which closes a real hole: sign-up is auto-confirmed, so whoever registers
-- the bootstrap admin address first would otherwise be an admin before proving
-- they own the inbox.
--
-- But he fixed it in the APP only, and said so. That left the two layers
-- disagreeing: the app refused an unverified admin while is_admin() and
-- admin_has() still returned true, so every RLS policy built on them would
-- have allowed exactly what the app had just refused. A gap like that is found
-- later and from the wrong side — the database is the layer that has to hold
-- when something reaches it directly, which is the whole reason the policies
-- exist rather than relying on the app being careful.
--
-- VERIFICATION IS OURS, NOT SUPABASE'S. investors.email_verified_at is set by
-- our own OTP code. auth.users.email_confirmed_at is auto-set on sign-up and
-- means nothing here, so it is deliberately not what these read.
--
-- Both functions are already SECURITY DEFINER, so they can see investors
-- regardless of the caller's own RLS.
--
-- Additive, idempotent, safe to re-run.
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
      join investors i on i.user_id = a.user_id
     where a.user_id = auth.uid()
       and a.disabled_at is null
       -- Our own OTP, not Supabase's auto-confirmation.
       and i.email_verified_at is not null
  );
$$;

comment on function is_admin() is
  'True when the caller is an enabled admin with a verified email. Used by '
  'every admin RLS policy. Verification is investors.email_verified_at, set '
  'by our own OTP — never auth.users.email_confirmed_at, which sign-up sets '
  'automatically and therefore proves nothing.';

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
      join investors i on i.user_id = a.user_id
     where a.user_id = auth.uid()
       -- A disabled admin holds nothing, whatever their role says.
       and a.disabled_at is null
       -- Nor does an unverified one, for the same reason.
       and i.email_verified_at is not null
       and (r.is_super or p_permission = any(r.permissions))
  );
$$;

comment on function admin_has(text) is
  'True when the caller holds this permission. Super admin holds all. '
  'Disabled and email-unverified admins hold none. Matches getAdmin() in '
  'src/lib/admin.ts — if one changes, change both.';

-- The INNER JOIN is the whole mechanism, so it is worth being explicit about
-- what happens when there is no investors row: the admin is refused. That is
-- the fail-closed direction, and it is the state the seed script used to leave
-- behind before it started setting email_verified_at.
--
-- A NOTICE rather than a failure: this is a legitimate state mid-setup, and a
-- migration that refuses to apply because somebody has not verified their
-- email yet would be worse than one that says so.
do $$
declare
  n integer;
begin
  select count(*) into n
    from app_admins a
    left join investors i on i.user_id = a.user_id
   where a.disabled_at is null
     and (i.id is null or i.email_verified_at is null);

  if n > 0 then
    raise notice
      '% enabled admin(s) have no verified email and are now refused by '
      'is_admin() and admin_has(). They must verify at /app/verify-email.', n;
  end if;
end$$;
