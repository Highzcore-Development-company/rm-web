-- Admin profiles: who a colleague is, not just what they may do.
--
-- Victor: "When I am creating an admin, I should be able to set the admin full
-- name, city, state, country, gender, permission and more information."
--
-- Until now an admin was an email address and a role. That is enough to decide
-- permission and nothing else — the Admins page could not tell you who
-- esther@highzcore.tech is, and the audit log names an address rather than a
-- person.
--
-- THE FIELDS LIVE IN TWO PLACES and that is deliberate. They are captured on
-- the INVITATION, because that is when the person doing the inviting knows
-- them, and copied onto app_admins when the invitation is accepted. Storing
-- them only on app_admins would mean asking the invitee to type their own
-- address and city on arrival, which is both worse and the opposite of what
-- was asked for.
--
-- EVERY FIELD IS NULLABLE. An invitation that cannot be sent because nobody
-- knew a colleague's state is a form that will be worked around, and a half
-- known profile is more useful than none.
--
-- Apply: Supabase dashboard > SQL editor > paste > run. Safe to re-run.

-- ---------------------------------------------------------------------------
-- The profile, on the staff row.
-- ---------------------------------------------------------------------------

alter table app_admins
  add column if not exists full_name text,
  add column if not exists job_title text,
  add column if not exists phone text,
  -- Free text, not an enum. A fixed list of genders is a schema change every
  -- time somebody does not fit it, and this field decides nothing — it is
  -- there so a colleague is a person on the page rather than an address.
  add column if not exists gender text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists country text,
  add column if not exists notes text,
  -- PERMISSIONS BEYOND THE ROLE.
  --
  -- The role stays the main answer: it is the thing with a name, the thing the
  -- page explains, and the thing almost everyone should be given. This is for
  -- the case the roles do not cover — one person who needs bot.configure
  -- without everything else Admin carries — and it only ever ADDS. There is no
  -- subtract, because a role that cannot be trusted to mean what it says is a
  -- role that should be changed instead.
  add column if not exists extra_permissions text[] not null default '{}';

comment on column app_admins.extra_permissions is
  'Permissions granted on top of the role. Additive only; never removes one '
  'the role grants. Prefer changing the role — this is the exception.';

comment on column app_admins.full_name is
  'The colleague''s name, captured on the invitation. Null for admins created '
  'before migration 20261016190000, and for anyone invited without one.';

-- ---------------------------------------------------------------------------
-- The same, on the invitation, so it survives until acceptance.
-- ---------------------------------------------------------------------------

alter table admin_invitations
  add column if not exists full_name text,
  add column if not exists job_title text,
  add column if not exists phone text,
  add column if not exists gender text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists country text,
  add column if not exists notes text,
  add column if not exists extra_permissions text[] not null default '{}';

comment on table admin_invitations is
  'Pending staff invitations. One row per invite; the token is stored hashed '
  'because the link itself is a credential that creates staff. Carries the '
  'profile the inviter filled in, which is copied to app_admins on accept.';

-- ---------------------------------------------------------------------------
-- admin_has(): the role's permissions, plus the extras.
--
-- THE UI AND THE DATABASE MUST NOT DISAGREE about who may do what. getAdmin()
-- in the app reads the same two sources and unions them the same way; this is
-- the half that the RLS policies call, and if only one of them learned about
-- extra_permissions then a button would appear for something the database
-- would still refuse.
--
-- Super admin is unchanged: it holds everything and ignores both lists.
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
       and a.disabled_at is null
       and a.accepted_at is not null
       and a.email_verified_at is not null
       and (
         r.is_super
         or p_permission = any(r.permissions)
         or p_permission = any(a.extra_permissions)
       )
  );
$$;

comment on function admin_has(text) is
  'True when the signed-in admin holds this permission, through their role or '
  'through extra_permissions. Mirrors getAdmin() in lib/admin.ts — change both '
  'or neither.';
