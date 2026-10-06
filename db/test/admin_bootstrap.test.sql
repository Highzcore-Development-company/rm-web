\set ON_ERROR_STOP on
grant usage on schema public to authenticated, anon;

\echo '--- 1. a user who signs up AFTER the migration is promoted'
insert into auth.users (id, email) values
  ('aaaa1111-0000-0000-0000-000000000001', 'estherolukorede12@gmail.com');
select count(*) = 1 as esther_is_admin
  from app_admins where user_id = 'aaaa1111-0000-0000-0000-000000000001';

\echo '--- 2. the promotion is case-insensitive'
insert into admin_bootstrap_emails (email) values (lower('MixedCase@Example.Com'));
insert into auth.users (id, email) values
  ('aaaa1111-0000-0000-0000-000000000002', 'MIXEDCASE@EXAMPLE.COM');
select count(*) = 1 as mixed_case_promoted
  from app_admins where user_id = 'aaaa1111-0000-0000-0000-000000000002';

\echo '--- 3. an ordinary signup is NOT promoted'
insert into auth.users (id, email) values
  ('aaaa1111-0000-0000-0000-000000000003', 'someone.else@gmail.com');
select count(*) = 0 as stranger_not_admin
  from app_admins where user_id = 'aaaa1111-0000-0000-0000-000000000003';

\echo '--- 4. is_admin() agrees for the promoted user'
set role authenticated;
set "test.user_id" = 'aaaa1111-0000-0000-0000-000000000001';
select is_admin() as esther_is_admin_fn;
reset role;

\echo '--- 5. and refuses the stranger'
set role authenticated;
set "test.user_id" = 'aaaa1111-0000-0000-0000-000000000003';
select is_admin() as stranger_is_admin_fn;
reset role;

\echo '--- 6. the stranger cannot read the bootstrap list (expect: denied)'
set role authenticated;
set "test.user_id" = 'aaaa1111-0000-0000-0000-000000000003';
\set ON_ERROR_STOP off
select count(*) from admin_bootstrap_emails;
\set ON_ERROR_STOP on
reset role;

\echo '--- 7. nor add themselves to it (expect: denied)'
set role authenticated;
set "test.user_id" = 'aaaa1111-0000-0000-0000-000000000003';
\set ON_ERROR_STOP off
insert into admin_bootstrap_emails (email) values ('someone.else@gmail.com');
\set ON_ERROR_STOP on
reset role;

\echo '--- 8. nor insert straight into app_admins (expect: denied)'
set role authenticated;
set "test.user_id" = 'aaaa1111-0000-0000-0000-000000000003';
\set ON_ERROR_STOP off
insert into app_admins (user_id) values ('aaaa1111-0000-0000-0000-000000000003');
\set ON_ERROR_STOP on
reset role;

\echo '--- 9. an admin sees every investor row; a stranger sees only their own'
insert into investors (user_id) values
  ('aaaa1111-0000-0000-0000-000000000001'),
  ('aaaa1111-0000-0000-0000-000000000003');

set role authenticated;
set "test.user_id" = 'aaaa1111-0000-0000-0000-000000000001';
select count(*) as investors_visible_to_admin from investors;
reset role;

set role authenticated;
set "test.user_id" = 'aaaa1111-0000-0000-0000-000000000003';
select count(*) as investors_visible_to_stranger from investors;
reset role;
