\set ON_ERROR_STOP on
grant usage on schema public to authenticated, anon;

-- Two investors and one admin.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'admin@example.com');

insert into app_admins (user_id) values ('33333333-3333-3333-3333-333333333333');

insert into investors (user_id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

\echo '--- 1. an investor reads only their own row'
set role authenticated;
set "test.user_id" = '11111111-1111-1111-1111-111111111111';
select count(*) as rows_visible_to_a from investors;
reset role;

\echo '--- 2. an admin reads every row'
set role authenticated;
set "test.user_id" = '33333333-3333-3333-3333-333333333333';
select count(*) as rows_visible_to_admin from investors;
reset role;

\echo '--- 3. an investor cannot set their own status (expect: permission denied)'
set role authenticated;
set "test.user_id" = '11111111-1111-1111-1111-111111111111';
\set ON_ERROR_STOP off
update investors set status = 'active' where user_id = auth.uid();
\set ON_ERROR_STOP on
reset role;

\echo '--- 4. an investor can claim a Vantage account'
set role authenticated;
set "test.user_id" = '11111111-1111-1111-1111-111111111111';
update investors set vantage_account_id = '5551234' where user_id = auth.uid();
select vantage_account_id from investors where user_id = '11111111-1111-1111-1111-111111111111';
reset role;

\echo '--- 5. a second investor cannot claim the same account (expect: unique violation)'
set role authenticated;
set "test.user_id" = '22222222-2222-2222-2222-222222222222';
\set ON_ERROR_STOP off
update investors set vantage_account_id = '5551234' where user_id = auth.uid();
\set ON_ERROR_STOP on
reset role;

\echo '--- 6. a non-numeric login is rejected (expect: check violation)'
set role authenticated;
set "test.user_id" = '22222222-2222-2222-2222-222222222222';
\set ON_ERROR_STOP off
update investors set vantage_account_id = 'not-a-login' where user_id = auth.uid();
\set ON_ERROR_STOP on
reset role;

\echo '--- 7. active without a confirmed account is rejected (expect: check violation)'
\set ON_ERROR_STOP off
update investors set status = 'active'
 where user_id = '22222222-2222-2222-2222-222222222222';
\set ON_ERROR_STOP on

\echo '--- 8. admin confirms the link; status goes active'
update investors set status = 'active', linked_at = now()
 where user_id = '11111111-1111-1111-1111-111111111111';
select status, vantage_account_id is not null as has_account
  from investors where user_id = '11111111-1111-1111-1111-111111111111';

\echo '--- 9. once confirmed, the investor cannot swap the account out (expect: 0 rows)'
set role authenticated;
set "test.user_id" = '11111111-1111-1111-1111-111111111111';
update investors set vantage_account_id = '9999999' where user_id = auth.uid();
reset role;
select vantage_account_id as unchanged
  from investors where user_id = '11111111-1111-1111-1111-111111111111';

\echo '--- 10. an investor cannot insert a row for somebody else (expect: policy violation)'
insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444', 'c@example.com');
set role authenticated;
set "test.user_id" = '11111111-1111-1111-1111-111111111111';
\set ON_ERROR_STOP off
insert into investors (user_id) values ('44444444-4444-4444-4444-444444444444');
\set ON_ERROR_STOP on
reset role;

\echo '--- 11. updated_at moves on update'
select updated_at > created_at as updated_at_fired
  from investors where user_id = '11111111-1111-1111-1111-111111111111';
