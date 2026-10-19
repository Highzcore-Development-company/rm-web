-- ---------------------------------------------------------------------------
-- Item 7 — the Overview becomes withholdable.
--
-- Victor's own example: "I disable an admin from seeing the overview." Today
-- /app/admin has no permission check at all. It hides individual SECTIONS on
-- bot.view and finance.view, which is right, but every admin can open the page
-- itself and there is no way to say no.
--
-- A permission lives in TWO places and they have to agree: PERMISSIONS in
-- lib/permissions.ts, which the app checks, and admin_has() here, which the
-- RLS policies call. If only the app knew about it, a button would appear for
-- something the database would still refuse — and the reverse is worse, since
-- a page would 404 with no explanation anywhere in the code.
--
-- admin_has() needs no change: it already answers for ANY permission by
-- looking it up in the role's array, so a new name works the moment a role
-- carries it. What has to change is the roles themselves.
--
-- GRANTED TO EVERY EXISTING ROLE. This is a withholding mechanism, not a new
-- restriction — nobody should lose a page they had this morning because a
-- permission was invented. Victor takes it away from whoever he means to.
--
-- Super admin is untouched: is_super short-circuits the array and holds
-- everything, including permissions that do not exist yet.
--
-- Additive, idempotent, safe to re-run.
-- ---------------------------------------------------------------------------

update admin_roles
   set permissions = array_append(permissions, 'overview.view')
 where not is_super
   and not ('overview.view' = any(permissions));

comment on table admin_roles is
  'Admin roles and the permissions each grants. Super admin ignores the list '
  'and holds all. Must stay in step with PERMISSIONS in lib/permissions.ts — '
  'a name in one and not the other is a control that appears and then fails.';

-- Says what changed. A migration that updated nothing because the column was
-- already right looks identical to one that silently matched no rows.
do $$
declare
  n integer;
begin
  select count(*) into n
    from admin_roles
   where not is_super and 'overview.view' = any(permissions);

  raise notice '% non-super role(s) can now be granted or denied the overview.', n;
end$$;
