\set ON_ERROR_STOP on
grant usage on schema public to authenticated, anon;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');

insert into investors (id, user_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222');

insert into api_keys (id, investor_id, name, key_hash, key_prefix) values
  ('dddddddd-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001', 'A key', 'hash-a', 'hz_live_aaaa'),
  ('dddddddd-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000002', 'B key', 'hash-b', 'hz_live_bbbb');

\echo '--- 1. a valid key is allowed and counted'
select allowed, calls from record_api_call('hash-a', 3);

\echo '--- 2. the counter increments within the same minute'
select allowed, calls from record_api_call('hash-a', 3);
select allowed, calls from record_api_call('hash-a', 3);

\echo '--- 3. the call PAST the limit is refused (expect allowed = f)'
select allowed, calls from record_api_call('hash-a', 3);

\echo '--- 4. an unknown key is refused and reveals nothing'
select allowed, calls, key_id is null as no_key_leaked
  from record_api_call('hash-does-not-exist', 3);

\echo '--- 5. a revoked key is refused'
update api_keys set revoked_at = now()
 where id = 'dddddddd-0000-0000-0000-000000000002';
select allowed from record_api_call('hash-b', 100);

\echo '--- 6. one key cannot be rate-limited by another key traffic'
-- B is revoked, so use a third live key to prove buckets are per-key.
insert into api_keys (id, investor_id, name, key_hash, key_prefix) values
  ('dddddddd-0000-0000-0000-000000000003',
   'aaaaaaaa-0000-0000-0000-000000000002', 'C key', 'hash-c', 'hz_live_cccc');
select allowed, calls from record_api_call('hash-c', 3);

\echo '--- 7. a developer sees only their own keys'
set role authenticated;
set "test.user_id" = '11111111-1111-1111-1111-111111111111';
select count(*) as keys_visible_to_a from api_keys;
reset role;

\echo '--- 8. and only their own usage'
set role authenticated;
set "test.user_id" = '22222222-2222-2222-2222-222222222222';
select count(*) as usage_visible_to_b from api_usage;
reset role;

\echo '--- 9. a developer cannot mint a key (expect: permission denied)'
set role authenticated;
set "test.user_id" = '11111111-1111-1111-1111-111111111111';
\set ON_ERROR_STOP off
insert into api_keys (investor_id, name, key_hash, key_prefix)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'forged', 'hash-x', 'hz_x');
\set ON_ERROR_STOP on
reset role;

\echo '--- 10. a developer cannot call the rate limiter (expect: permission denied)'
set role authenticated;
set "test.user_id" = '11111111-1111-1111-1111-111111111111';
\set ON_ERROR_STOP off
select record_api_call('hash-a', 999999);
\set ON_ERROR_STOP on
reset role;

\echo '--- 11. two keys cannot share a hash (expect: unique violation)'
\set ON_ERROR_STOP off
insert into api_keys (investor_id, name, key_hash, key_prefix)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'dup', 'hash-a', 'hz_dup');
\set ON_ERROR_STOP on
