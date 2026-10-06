-- ---------------------------------------------------------------------------
-- P2-007 — bootstrap. RUN THIS FIRST, before p2_001.
--
-- WHY THIS EXISTS. The earlier migrations were written when rm-web was going
-- to share the company site's Supabase project, and they call two helpers that
-- came from its schema: set_updated_at() and is_admin(). rm-web is now its own
-- project, so neither exists and p2_001 would fail on its first line that uses
-- them.
--
-- That split is a straight improvement and worth recording: the company site
-- puts an AFTER INSERT trigger on auth.users which mirrored every signup into
-- its own users table as a 'student'. On a shared project, every investor who
-- signed up here would have appeared in the academy's user list. Separate
-- projects remove the problem rather than work around it.
--
-- Additive and safe to re-run.
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- Admins.
--
-- On the shared project this was public.users.role, owned by the company site.
-- Here it is an explicit table: being an admin of highzcore.com is its own
-- fact, not a side effect of a role on another product.
--
-- Rows are added by hand in the Supabase dashboard. There is deliberately no
-- UI for granting admin: the whole set is small, changes rarely, and an
-- escalation path through the app is a much bigger attack surface than a
-- person opening the dashboard twice a year.
-- ---------------------------------------------------------------------------

create table if not exists app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

comment on table app_admins is
  'Admins of highzcore.com. Managed by hand in the dashboard; no in-app grant path.';

alter table app_admins enable row level security;

-- No policies at all, by design. RLS with no policy denies everything to anon
-- and authenticated, so the table is readable only by the service role and by
-- is_admin() below, which is SECURITY DEFINER. An investor cannot enumerate
-- who the admins are, nor check whether they are one.
revoke all on app_admins from anon, authenticated;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from app_admins where user_id = auth.uid());
$$;

comment on function is_admin() is
  'True when the caller is in app_admins. Used by every admin RLS policy.';

grant execute on function is_admin() to authenticated;
