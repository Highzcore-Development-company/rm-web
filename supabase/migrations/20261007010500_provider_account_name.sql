-- ---------------------------------------------------------------------------
-- Keep the account NAME alongside the number.
--
-- The first live ALATPay call returned a working virtual account number, so the
-- endpoint is right — but the payment screen showed only a number. A Nigerian
-- bank transfer form asks for the bank and shows the account name back for
-- confirmation, and without either the payer cannot complete the transfer.
--
-- Stored for the same reason as the number: it has to survive a refresh and a
-- trip to a banking app.
--
-- Additive and safe to re-run.
-- ---------------------------------------------------------------------------

alter table subscriptions
  add column if not exists provider_account_name text;

comment on column subscriptions.provider_account_name is
  'Name the virtual account is held in. Shown back to the payer to confirm before sending.';
