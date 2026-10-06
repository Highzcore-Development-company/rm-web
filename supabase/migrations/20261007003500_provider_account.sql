-- ---------------------------------------------------------------------------
-- Keep the details a payer still needs after they refresh.
--
-- The virtual account number was returned by ALATPay, rendered once, and
-- never stored. Refreshing the checkout page therefore lost it and showed the
-- plan chooser again — as though the payment had never been started.
--
-- That is worse than an inconvenience. Someone who has already transferred,
-- sees the chooser, and starts again ends up with two invoices and may pay
-- twice. The crypto side had the same shape of bug but kept its address in
-- crypto_invoices, so only the bank path lost everything.
--
-- Additive and safe to re-run.
-- ---------------------------------------------------------------------------

alter table subscriptions
  add column if not exists provider_account_number text,
  add column if not exists provider_bank_name text;

comment on column subscriptions.provider_account_number is
  'Virtual account the payer transfers to. Not a secret, and needed again on every page load.';

-- The outstanding-invoice lookup on checkout runs for every visit to the page.
create index if not exists subscriptions_awaiting_idx
  on subscriptions (investor_id, created_at desc)
  where status = 'awaiting';
