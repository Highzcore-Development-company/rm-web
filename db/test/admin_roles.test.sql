\set ON_ERROR_STOP on
grant usage on schema public to authenticated, anon;

insert into auth.users (id, email) values
  ('55555555-0000-0000-0000-000000000001', 'admin@highzcore.tech'),
  ('55555555-0000-0000-0000-000000000002', 'support@highzcore.tech'),
  ('55555555-0000-0000-0000-000000000003', 'finance@highzcore.tech'),
  ('55555555-0000-0000-0000-000000000004', 'investor@example.com'),
  ('55555555-0000-0000-0000-000000000005', 'sacked@highzcore.tech');

-- The seed address is promoted to super_admin by the trigger; the rest are
-- inserted directly, as an admin creating an admin would.
insert into app_admins (user_id, role) values
  ('55555555-0000-0000-0000-000000000002', 'support'),
  ('55555555-0000-0000-0000-000000000003', 'finance'),
  ('55555555-0000-0000-0000-000000000005', 'admin');

update app_admins set disabled_at = now()
 where user_id = '55555555-0000-0000-0000-000000000005';

\echo '--- 1. the seed address landed as super_admin, needing a password change'
select role, must_change_password
  from app_admins where user_id = '55555555-0000-0000-0000-000000000001';

\echo '--- 2. super admin holds every permission, including ones no role lists'
set role authenticated;
set "test.user_id" = '55555555-0000-0000-0000-000000000001';
select admin_has('users.delete') as can_delete,
       admin_has('admins.manage') as can_manage_admins,
       admin_has('bot.configure') as can_configure_bot;
reset role;

\echo '--- 3. support sees users and the bot, and nothing else'
set role authenticated;
set "test.user_id" = '55555555-0000-0000-0000-000000000002';
select admin_has('users.view') as view_users,
       admin_has('users.delete') as delete_users,
       admin_has('finance.view') as view_finance,
       admin_has('admins.manage') as manage_admins;
reset role;

\echo '--- 4. finance sees money, not the bot'
set role authenticated;
set "test.user_id" = '55555555-0000-0000-0000-000000000003';
select admin_has('finance.view') as view_finance,
       admin_has('bot.configure') as configure_bot;
reset role;

\echo '--- 5. a DISABLED admin holds nothing, whatever the role says'
set role authenticated;
set "test.user_id" = '55555555-0000-0000-0000-000000000005';
select admin_has('users.view') as view_users,
       is_admin() as still_an_admin;
reset role;

\echo '--- 6. an investor holds nothing'
set role authenticated;
set "test.user_id" = '55555555-0000-0000-0000-000000000004';
select admin_has('users.view') as view_users, is_admin() as is_admin;
reset role;

\echo '--- 7. a super admin cannot be disabled (expect: exception)'
\set ON_ERROR_STOP off
update app_admins set disabled_at = now()
 where user_id = '55555555-0000-0000-0000-000000000001';
\set ON_ERROR_STOP on

\echo '--- 8. nor deleted (expect: exception)'
\set ON_ERROR_STOP off
delete from app_admins where user_id = '55555555-0000-0000-0000-000000000001';
\set ON_ERROR_STOP on

\echo '--- 9. an ordinary admin CAN be disabled'
update app_admins set disabled_at = now()
 where user_id = '55555555-0000-0000-0000-000000000002';
select disabled_at is not null as support_disabled
  from app_admins where user_id = '55555555-0000-0000-0000-000000000002';

\echo '--- 10. a non-super admin cannot manage admins (expect: 0 rows changed)'
update app_admins set disabled_at = null
 where user_id = '55555555-0000-0000-0000-000000000002';
set role authenticated;
set "test.user_id" = '55555555-0000-0000-0000-000000000003';
\set ON_ERROR_STOP off
update app_admins set role = 'super_admin'
 where user_id = '55555555-0000-0000-0000-000000000003';
\set ON_ERROR_STOP on
reset role;
select role as finance_role_after_self_promotion
  from app_admins where user_id = '55555555-0000-0000-0000-000000000003';

\echo '--- 11. the audit trail records the actor, not whoever composed the row'
set role authenticated;
set "test.user_id" = '55555555-0000-0000-0000-000000000002';
select record_admin_action('user.disabled', 'investor', 'abc', '{"reason":"test"}');
reset role;
select actor_email, action, target_id from admin_audit order by created_at desc limit 1;

\echo '--- 12. nobody can edit or delete the audit trail (expect: denied)'
set role authenticated;
set "test.user_id" = '55555555-0000-0000-0000-000000000001';
\set ON_ERROR_STOP off
update admin_audit set action = 'rewritten';
\set ON_ERROR_STOP on
\set ON_ERROR_STOP off
delete from admin_audit;
\set ON_ERROR_STOP on
reset role;
