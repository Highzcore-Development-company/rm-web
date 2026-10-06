-- Minimal stand-ins for what a BRAND NEW Supabase project already provides.
--
-- Deliberately nothing else. p2_000 must create set_updated_at(), app_admins
-- and is_admin() itself — if this file provided them, the tests would pass on a
-- machine where the real migration would fail.

create schema if not exists auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique
);

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end $$;

-- Stand-in for Supabase's auth.uid(). Reads a session setting so a test can
-- impersonate a user: set role authenticated; set "test.user_id" = '<uuid>';
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('test.user_id', true), '')::uuid;
$$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
