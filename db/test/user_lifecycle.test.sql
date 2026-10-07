\set ON_ERROR_STOP on
grant usage on schema public to authenticated, anon;

insert into auth.users (id, email) values
  ('66666666-0000-0000-0000-000000000001', 'admin@highzcore.tech'),
  ('66666666-0000-0000-0000-000000000002', 'victim@example.com');

insert into investors (id, user_id, status, vantage_account_id, linked_at,
                       email_verified_at, risk_acknowledged_at)
values ('77777777-0000-0000-0000-000000000001',
        '66666666-0000-0000-0000-000000000002', 'active', '5551234',
        now(), now(), now());

-- A confirmed term with a month left, and one that expired last year.
insert into subscriptions (id, investor_id, months, amount_usd, method, status,
                           starts_at, expires_at, provider_ref)
values ('88888888-0000-0000-0000-000000000001',
        '77777777-0000-0000-0000-000000000001', 1, 2000, 'alatpay_transfer',
        'confirmed', now() - interval '2 days', now() + interval '28 days', 'LIVE-1'),
       ('88888888-0000-0000-0000-000000000002',
        '77777777-0000-0000-0000-000000000001', 1, 2000, 'alatpay_transfer',
        'confirmed', now() - interval '400 days', now() - interval '370 days', 'OLD-1');

\echo '--- 1. disabling without a reason is refused (expect: exception)'
\set ON_ERROR_STOP off
select disable_investor('77777777-0000-0000-0000-000000000001', '   ');
\set ON_ERROR_STOP on

\echo '--- 2. disabling records who, when, why, and the status to restore'
select disable_investor('77777777-0000-0000-0000-000000000001', 'chargeback fraud');
select status, status_before_disable, disabled_reason,
       disabled_at is not null as has_timestamp
  from investors where id = '77777777-0000-0000-0000-000000000001';

\echo '--- 3. disabling twice does not overwrite the first reason'
select disable_investor('77777777-0000-0000-0000-000000000001', 'second attempt');
select disabled_reason from investors
 where id = '77777777-0000-0000-0000-000000000001';

\echo '--- 4. re-enabling restores the previous status, not a guess'
select expires_at as live_before from subscriptions
 where id = '88888888-0000-0000-0000-000000000001' \gset
select enable_investor('77777777-0000-0000-0000-000000000001');
select status, disabled_at is null as cleared,
       status_before_disable is null as restore_point_cleared
  from investors where id = '77777777-0000-0000-0000-000000000001';

\echo '--- 5. the live subscription was extended by the paused time'
select expires_at > :'live_before' as live_term_extended
  from subscriptions where id = '88888888-0000-0000-0000-000000000001';

\echo '--- 6. an already-expired term was NOT extended'
select expires_at < now() as old_term_still_expired
  from subscriptions where id = '88888888-0000-0000-0000-000000000002';

\echo '--- 7. soft delete anonymises the person'
select soft_delete_investor('77777777-0000-0000-0000-000000000001');
select vantage_account_id is null as login_gone,
       email_verified_at is null as verification_gone,
       risk_acknowledged_at is null as acknowledgement_gone,
       deleted_at is not null as marked_deleted,
       status as final_status
  from investors where id = '77777777-0000-0000-0000-000000000001';

\echo '--- 8. and keeps the money'
select count(*) as subscriptions_kept,
       sum(amount_usd) as total_usd_kept
  from subscriptions where investor_id = '77777777-0000-0000-0000-000000000001';

\echo '--- 9. an investor cannot disable anyone, including themselves'
set role authenticated;
set "test.user_id" = '66666666-0000-0000-0000-000000000002';
\set ON_ERROR_STOP off
select disable_investor('77777777-0000-0000-0000-000000000001', 'let me out');
\set ON_ERROR_STOP on
reset role;

\echo '--- 10. nor soft delete (expect: permission denied)'
set role authenticated;
set "test.user_id" = '66666666-0000-0000-0000-000000000002';
\set ON_ERROR_STOP off
select soft_delete_investor('77777777-0000-0000-0000-000000000001');
\set ON_ERROR_STOP on
reset role;
