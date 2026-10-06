-- ---------------------------------------------------------------------------
-- Bootstrap the first admins.
--
-- THE ORDERING PROBLEM. app_admins.user_id references auth.users(id), and the
-- first admin has not signed up yet — there are zero users in this project. A
-- plain insert fails the foreign key, and a migration cannot be re-run later
-- once the CLI has recorded it as applied.
--
-- So this does not insert a user id. It records an EMAIL that should be an
-- admin, and promotes it whenever that account appears — before or after this
-- migration runs, in either order.
--
-- WHY THIS IS SAFE, stated plainly because an email-based privilege grant
-- deserves the scrutiny: auth.users.email is unique and Supabase verifies it,
-- so only the person who controls the inbox can hold that address. The
-- bootstrap table is service-role only: an investor cannot read who is on it,
-- cannot add themselves, and cannot see that it exists.
--
-- This is for the first admin or two. Everyone after that is added by an
-- existing admin inserting into app_admins directly. There is deliberately no
-- in-app grant path.
--
-- Additive and safe to re-run.
-- ---------------------------------------------------------------------------

create table if not exists admin_bootstrap_emails (
  email text primary key,
  note text,
  created_at timestamptz not null default now()
);

comment on table admin_bootstrap_emails is
  'Emails promoted to admin on sign-up. Service role only. For the first admins only.';

alter table admin_bootstrap_emails enable row level security;

-- No policies at all. RLS with no policy denies everything to anon and
-- authenticated, so only the service role and the SECURITY DEFINER function
-- below can see or change it.
revoke all on admin_bootstrap_emails from anon, authenticated;

-- Lowercased on the way in: addresses are compared case-insensitively, and a
-- capital letter here would silently mean "never promoted".
insert into admin_bootstrap_emails (email, note)
values (lower('estherolukorede12@gmail.com'), 'Esther — first admin')
on conflict (email) do nothing;


-- ---------------------------------------------------------------------------
-- Promote on sign-up.
-- ---------------------------------------------------------------------------

create or replace function promote_bootstrap_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from admin_bootstrap_emails
     where email = lower(new.email)
  ) then
    insert into app_admins (user_id, note)
    values (new.id, 'promoted from admin_bootstrap_emails')
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_promote_admin on auth.users;
create trigger on_auth_user_created_promote_admin
  after insert on auth.users
  for each row execute function promote_bootstrap_admin();


-- ---------------------------------------------------------------------------
-- Catch up anyone who already signed up before this ran. Makes the migration
-- order-independent: it works whether the account exists yet or not.
-- ---------------------------------------------------------------------------

insert into app_admins (user_id, note)
select u.id, 'promoted from admin_bootstrap_emails'
  from auth.users u
  join admin_bootstrap_emails b on b.email = lower(u.email)
on conflict (user_id) do nothing;
