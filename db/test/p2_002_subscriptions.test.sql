\set ON_ERROR_STOP on
grant usage on schema public to authenticated, anon;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'admin@example.com');
insert into public.users (id, email, role) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com', 'student'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com', 'student'),
  ('33333333-3333-3333-3333-333333333333', 'admin@example.com', 'admin');

insert into investors (id, user_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222');

\echo '--- 1. an unpaid invoice grants nothing'
insert into subscriptions (id, investor_id, months, amount_usd, method)
values ('bbbbbbbb-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001', 3, 5700, 'alatpay_transfer');
select investor_entitlement('aaaaaaaa-0000-0000-0000-000000000001') is null
       as entitlement_is_null;

\echo '--- 2. activation banks the payment and returns the expiry'
select activate_subscription('bbbbbbbb-0000-0000-0000-000000000001', 'ALAT-REF-1')
       is not null as activated;
select status, months,
       (expires_at::date - starts_at::date) between 89 and 92 as three_months
  from subscriptions where id = 'bbbbbbbb-0000-0000-0000-000000000001';

\echo '--- 3. replaying the SAME activation does not extend anything'
select expires_at as before_replay from subscriptions
 where id = 'bbbbbbbb-0000-0000-0000-000000000001' \gset
select activate_subscription('bbbbbbbb-0000-0000-0000-000000000001', 'ALAT-REF-1');
select expires_at = :'before_replay' as unchanged_after_replay
  from subscriptions where id = 'bbbbbbbb-0000-0000-0000-000000000001';

\echo '--- 4. the same provider ref cannot be banked against a second row'
insert into subscriptions (id, investor_id, months, amount_usd, method)
values ('bbbbbbbb-0000-0000-0000-000000000002',
        'aaaaaaaa-0000-0000-0000-000000000001', 1, 2000, 'alatpay_transfer');
\set ON_ERROR_STOP off
select activate_subscription('bbbbbbbb-0000-0000-0000-000000000002', 'ALAT-REF-1');
\set ON_ERROR_STOP on

\echo '--- 5. renewing STACKS onto the remaining term, it does not restart it'
select activate_subscription('bbbbbbbb-0000-0000-0000-000000000002', 'ALAT-REF-2');
select (investor_entitlement('aaaaaaaa-0000-0000-0000-000000000001')::date
        - now()::date) between 118 and 124 as four_months_total;

\echo '--- 6. a confirmed row must have a term (expect: check violation)'
\set ON_ERROR_STOP off
insert into subscriptions (investor_id, months, amount_usd, method, status)
values ('aaaaaaaa-0000-0000-0000-000000000001', 1, 2000, 'usdt_trc20', 'confirmed');
\set ON_ERROR_STOP on

\echo '--- 7. an NGN amount without its rate is rejected (expect: check violation)'
\set ON_ERROR_STOP off
insert into subscriptions (investor_id, months, amount_usd, amount_ngn, method)
values ('aaaaaaaa-0000-0000-0000-000000000001', 1, 2000, 3200000, 'alatpay_card');
\set ON_ERROR_STOP on

\echo '--- 8. an investor sees only their own payments'
set role authenticated;
set "test.user_id" = '11111111-1111-1111-1111-111111111111';
select count(*) as visible_to_a from subscriptions;
reset role;

set role authenticated;
set "test.user_id" = '22222222-2222-2222-2222-222222222222';
select count(*) as visible_to_b from subscriptions;
reset role;

\echo '--- 9. an investor cannot raise their own invoice (expect: permission denied)'
set role authenticated;
set "test.user_id" = '11111111-1111-1111-1111-111111111111';
\set ON_ERROR_STOP off
insert into subscriptions (investor_id, months, amount_usd, method)
values ('aaaaaaaa-0000-0000-0000-000000000001', 12, 1, 'alatpay_card');
\set ON_ERROR_STOP on
reset role;

\echo '--- 10. an investor cannot call activate_subscription (expect: permission denied)'
set role authenticated;
set "test.user_id" = '11111111-1111-1111-1111-111111111111';
\set ON_ERROR_STOP off
select activate_subscription('bbbbbbbb-0000-0000-0000-000000000002', 'FORGED');
\set ON_ERROR_STOP on
reset role;

\echo '--- 11. crypto: two invoices never share an address or an index'
insert into subscriptions (id, investor_id, months, amount_usd, method)
values ('cccccccc-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000002', 1, 2000, 'usdt_trc20'),
       ('cccccccc-0000-0000-0000-000000000002',
        'aaaaaaaa-0000-0000-0000-000000000002', 1, 2000, 'usdt_trc20');
insert into crypto_invoices (subscription_id, address, expected_micro_usdt, contract, confirmations_required)
values ('cccccccc-0000-0000-0000-000000000001', 'TAddrOne', 20000000, 'TR7NHq', 20),
       ('cccccccc-0000-0000-0000-000000000002', 'TAddrTwo', 20000000, 'TR7NHq', 20);
select count(distinct derivation_index) = 2 as indexes_distinct,
       count(distinct address) = 2 as addresses_distinct
  from crypto_invoices;

\echo '--- 12. an address cannot be reused (expect: unique violation)'
insert into subscriptions (id, investor_id, months, amount_usd, method)
values ('cccccccc-0000-0000-0000-000000000003',
        'aaaaaaaa-0000-0000-0000-000000000002', 1, 2000, 'usdt_trc20');
\set ON_ERROR_STOP off
insert into crypto_invoices (subscription_id, address, expected_micro_usdt, contract, confirmations_required)
values ('cccccccc-0000-0000-0000-000000000003', 'TAddrOne', 20000000, 'TR7NHq', 20);
\set ON_ERROR_STOP on

\echo '--- 13. one tx hash cannot satisfy two invoices (expect: unique violation)'
update crypto_invoices set seen_tx_hash = 'TXHASH1', seen_at = now()
 where address = 'TAddrOne';
\set ON_ERROR_STOP off
update crypto_invoices set seen_tx_hash = 'TXHASH1', seen_at = now()
 where address = 'TAddrTwo';
\set ON_ERROR_STOP on

\echo '--- 14. b sees their own crypto invoices, a sees none of them'
set role authenticated;
set "test.user_id" = '22222222-2222-2222-2222-222222222222';
select count(*) as crypto_visible_to_b from crypto_invoices;
reset role;
set role authenticated;
set "test.user_id" = '11111111-1111-1111-1111-111111111111';
select count(*) as crypto_visible_to_a from crypto_invoices;
reset role;
