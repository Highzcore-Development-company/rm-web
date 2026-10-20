-- ---------------------------------------------------------------------------
-- Restore Esther's admin access.
--
-- She was super_admin on 13 October and the row is gone. There is no
-- admin_audit entry for a removal, so it was not done through the Admins page
-- — most likely the table was reseeded when full_name and the profile columns
-- arrived with 20261016190000, and her row did not survive it.
--
-- BY EMAIL, NOT BY ID. The uuid is environment-specific; the address is the
-- same person everywhere, and a migration with a hardcoded uuid in it is a
-- migration that silently does nothing on any other database.
--
-- SUPER_ADMIN because that is what she had. Restoring a prior state is the
-- honest default — this is putting back what was there, not granting
-- something new. If that is wrong, any super admin can change the role from
-- the Admins page in a click, and that change will be audited.
--
-- accepted_at and email_verified_at are set because both were already true of
-- her: she accepted long ago and has signed in since. Leaving them null would
-- restore a row that is_admin() still refuses, which looks identical to not
-- being restored at all.
--
-- must_change_password is FALSE on purpose. That flag exists for a password WE
-- set — a seeded or invited account whose password somebody else has seen. She
-- chose her own and we have never had it, so forcing a change would be
-- friction that buys nothing.
--
-- Idempotent, and safe on a database where the account does not exist: the
-- insert simply matches no rows rather than failing the migration.
-- ---------------------------------------------------------------------------

insert into app_admins (
  user_id,
  role,
  full_name,
  accepted_at,
  email_verified_at,
  must_change_password,
  note
)
select
  u.id,
  'super_admin',
  'Esther Olukorede',
  now(),
  now(),
  false,
  'Restored by migration 20261017090000 — was super_admin until the row was lost.'
from auth.users u
where lower(u.email) = 'estherolukorede12@gmail.com'
on conflict (user_id) do update
  set role = 'super_admin',
      -- Cleared in case the row exists but is disabled: a disabled admin is
      -- refused by is_admin() just as firmly as a missing one.
      disabled_at = null,
      disabled_by = null,
      disabled_reason = null,
      accepted_at = coalesce(app_admins.accepted_at, now()),
      email_verified_at = coalesce(app_admins.email_verified_at, now()),
      must_change_password = false,
      full_name = coalesce(app_admins.full_name, 'Esther Olukorede');

-- Says plainly whether it worked. A migration that quietly matched no rows
-- because the email is different on this database would otherwise look
-- identical to one that succeeded.
do $$
declare
  n integer;
begin
  select count(*) into n
    from app_admins a
    join auth.users u on u.id = a.user_id
   where lower(u.email) = 'estherolukorede12@gmail.com'
     and a.disabled_at is null;

  if n = 0 then
    raise notice
      'No admin row created: no auth user with that address on this database.';
  else
    raise notice 'Esther restored as super_admin.';
  end if;
end$$;
