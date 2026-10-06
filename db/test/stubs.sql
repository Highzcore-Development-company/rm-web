-- Minimal stand-ins for what the real Supabase project already provides, so
-- the migration can be run against a throwaway Postgres. Not a schema — just
-- enough for the migration's dependencies to resolve.

create schema if not exists auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique
);

-- Supabase's role names.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end $$;

-- Stand-in for Supabase's auth.uid(). Reads a session setting so tests can
-- impersonate a user.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('test.user_id', true), '')::uuid;
$$;

-- The company site's helper (schema.sql).
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'student'
);

create or replace function public.is_admin() returns boolean
language plpgsql security definer set search_path = public as $$
declare result boolean;
begin
  select (u.role = 'admin') into result from public.users u where u.id = auth.uid();
  return coalesce(result, false);
end;
$$;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Supabase grants these; the migration's policies call auth.uid().
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
