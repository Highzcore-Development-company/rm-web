-- ---------------------------------------------------------------------------
-- HS-BOT-v4 §1 — two account types on one platform.
--
-- We sell two things to two people:
--
--   trader    buys Scora, places their own trades, has no broker account with
--             us and never should. Self-serves entirely.
--   investor  has their money traded by the bot on their own Vantage account.
--             Does NOT self-serve: they fill in a form, Victor meets them, and
--             the account is set up with them.
--
-- The system has to know which it is looking at from the first screen, because
-- until it does there is nowhere correct to send anyone.
--
-- NEVER NULL. Every account is one or the other, and a nullable column would
-- mean every gate below needs a third branch for "we don't know", which is how
-- a trader ends up looking at a broker-linking screen.
--
-- BACKFILL, and it is a judgement call worth stating. Every existing row
-- signed up under the old model, where the only thing on offer was having the
-- bot trade your account. So they become 'investor' — that is what they were
-- actually sold, and it keeps their screens working. Anyone who in truth only
-- wanted Scora is mislabelled by this and an admin has to move them; there is
-- no signal in the data to tell them apart, and guessing from behaviour would
-- hide the Vantage screens from somebody who has already linked an account.
--
-- Additive and safe to re-run.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'account_type') then
    create type account_type as enum ('trader', 'investor');
  end if;
end$$;

alter table investors
  add column if not exists account_type account_type;

-- Existing rows first, then the NOT NULL. The other order fails on any table
-- that already has data, which is every environment this will run in.
update investors set account_type = 'investor' where account_type is null;

alter table investors
  alter column account_type set not null,
  -- 'investor' is the safe default for a row created by anything that does not
  -- yet set it — ensureInvestor() on an OAuth callback, for instance. It grants
  -- nothing on its own: an investor still cannot trade until an admin links
  -- their broker account by hand. A default of 'trader' would hand somebody the
  -- paid product by accident.
  alter column account_type set default 'investor';

comment on column investors.account_type is
  'trader = buys Scora and places their own trades, no broker account. '
  'investor = the bot trades their own Vantage account, set up by an admin '
  'after a call. Never null; every account is one or the other.';

create index if not exists investors_account_type_idx
  on investors (account_type);


-- ---------------------------------------------------------------------------
-- The gate, in the database.
--
-- "A hidden button is not a permission." Hiding the Vantage screens from a
-- trader in the UI stops them seeing the form; it does nothing to stop a
-- crafted request writing vantage_account_id directly.
--
-- The investor self-write policy predates account types and allowed any
-- investor to claim a broker account on their own row. It now additionally
-- requires the row to BE an investor.
--
-- Note what this does NOT do: it does not let an investor self-serve either.
-- Claiming a login still only sets a claim for an admin to verify against the
-- MAM panel. The brief's rule — an investor cannot finish signing up alone —
-- holds because linking is an admin action, not because the column is locked.
-- ---------------------------------------------------------------------------

-- Claiming a broker login (P2-203) is the one thing a trader must never be
-- able to do on their own row. The policy already restricted it to your own
-- row and to an unconfirmed account; it now also requires the row to BE an
-- investor.
drop policy if exists "investors self claim account" on investors;
create policy "investors self claim account" on investors
  for update to authenticated
  using (
    user_id = auth.uid()
    and linked_at is null
    and account_type = 'investor'
  )
  with check (
    user_id = auth.uid()
    and account_type = 'investor'
  );

comment on policy "investors self claim account" on investors is
  'An investor may claim their own Vantage login for an admin to verify. A '
  'trader may not: they have no broker account, so these columns are not '
  'theirs to set. Enforced here as well as in the UI — a hidden button is '
  'not a permission.';

-- The risk acknowledgement is an investor's. A trader is not having their
-- money traded by us, so they are never asked — and must not be able to write
-- a record saying they were.
drop policy if exists "investors self acknowledge risk" on investors;
create policy "investors self acknowledge risk" on investors
  for update to authenticated
  using (
    user_id = auth.uid()
    and risk_acknowledged_at is null
    and account_type = 'investor'
  )
  with check (
    user_id = auth.uid()
    and account_type = 'investor'
  );
