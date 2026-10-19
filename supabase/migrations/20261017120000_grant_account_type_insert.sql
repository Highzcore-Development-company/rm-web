-- ---------------------------------------------------------------------------
-- Let a new account write its own account_type. This is a live bug.
--
-- investors uses COLUMN-LEVEL insert grants:
--
--   grant insert (user_id) on investors to authenticated;
--
-- and nothing else. When account_type was added in 20261012090000,
-- ensureInvestor started inserting it — so Postgres refused the whole
-- statement, every time, for anybody without an investors row yet.
--
-- WHO THAT BREAKS: every new signup, and every Google sign-in whose row is
-- created at the gate rather than at signup. The error surfaces as
-- "[investors] insert failed: {}" — empty, because a column-privilege refusal
-- carries no body, which is why it read as a mystery rather than a permission.
--
-- My bug: I added the column and the insert and did not notice the table was
-- on column grants. A table with ONE granted column looks identical to a table
-- with none until you look.
--
-- INSERT ONLY, DELIBERATELY. There is still no update grant on account_type,
-- so somebody chooses once at signup and cannot switch afterwards — which is
-- what the brief asks for ("do not add account-type switching"). Changing
-- somebody's type stays an admin action through the service role.
--
-- Nothing is gained by self-selecting the wrong one: a trader cannot claim a
-- broker account (the claim policy requires account_type = 'investor'), and
-- Scora needs a confirmed subscription on top of being a trader.
--
-- Additive and safe to re-run.
-- ---------------------------------------------------------------------------

grant insert (account_type) on investors to authenticated;

comment on column investors.account_type is
  'trader = buys Scora and places their own trades, no broker account. '
  'investor = the bot trades their own Vantage account, set up by an admin '
  'after a call. Never null. INSERT is granted to authenticated so a new '
  'account can record the choice made at signup; UPDATE deliberately is not, '
  'so it cannot be switched afterwards.';
