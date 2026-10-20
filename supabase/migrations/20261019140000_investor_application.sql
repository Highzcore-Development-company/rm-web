-- ---------------------------------------------------------------------------
-- Item 9 — the investor application.
--
-- An investor is a BUSINESS whose own Vantage account the bot trades. That is
-- a different relationship from a Scora subscription and the record has to
-- carry it: who the company is, who we deal with, who owns it, what they
-- intend to place, and what they have agreed to.
--
-- SCOPED TO THE INVESTOR SIDE (Victor, 19 Oct). No developer type, no change
-- to the account_type enum, and the existing shared signup for traders is
-- untouched. This adds a second route; it does not replace the first.
--
-- IT CREATES AN APPLICATION, NOT AN INVESTOR. status already has `pending`
-- for exactly this. An admin reviews it and links the broker account, and only
-- then does it become `linked`. A business must not be able to self-activate
-- into a live trading relationship, which is why none of the grants below
-- reach status, linked_at or vantage_account_id — those stay admin-only
-- through the service role, exactly as they are today.
--
-- EVERY COLUMN IS NULLABLE, deliberately. Nobody has their RC number and a
-- scan of the certificate of incorporation to hand in one sitting, and a form
-- that loses everything on refresh does not get completed. The application is
-- filled over several visits; `submitted_at` is what says it is finished and
-- ready for an admin to look at.
--
-- Additive and safe to re-run.
-- ---------------------------------------------------------------------------

alter table investors
  -- ---- the company: the party to the agreement ----------------------------
  add column if not exists company_name text,
  -- The ONLY field that uniquely identifies a company. Two businesses can
  -- share a trading name; they cannot share a registration number.
  add column if not exists company_reg_number text,
  add column if not exists company_country text,
  add column if not exists company_state text,
  add column if not exists company_address text,
  add column if not exists company_tax_id text,
  add column if not exists company_nature text,
  add column if not exists company_website text,

  -- ---- who we deal with ---------------------------------------------------
  -- Somebody has to be able to say "stop trading" and be believed.
  add column if not exists contact_name text,
  add column if not exists contact_role text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  -- False means this person relays but cannot instruct, and the name of
  -- whoever can goes in the next column. A blank authorised contact on an
  -- account that trades is a question somebody will ask at the worst moment.
  add column if not exists contact_may_instruct boolean,
  add column if not exists instructing_party text,

  -- ---- the money ----------------------------------------------------------
  -- Minor units, like every other amount in this schema. Never a float: these
  -- numbers end up on an agreement.
  add column if not exists intended_amount_usd bigint,
  add column if not exists source_of_funds text,
  add column if not exists preferred_currency text,
  -- They either have an account or want one opened. Both are answers; null is
  -- "not asked yet", which is why this is a boolean and not an assumption.
  add column if not exists wants_account_opened boolean,

  -- ---- paperwork ----------------------------------------------------------
  -- A storage path, not a file. Victor: if uploads slow the form down, build
  -- without them and collect on the call — so this is nullable and nothing
  -- depends on it. The bucket can arrive later without a second migration.
  add column if not exists incorporation_cert_path text,

  -- ---- agreements ---------------------------------------------------------
  -- Same shape as risk_acknowledged_at, which already exists: a timestamp,
  -- and an RLS policy below that permits only null -> a value. An agreement
  -- that can be un-agreed is not evidence of anything.
  add column if not exists management_agreement_at timestamptz,
  add column if not exists terms_accepted_at timestamptz,

  -- ---- the application itself --------------------------------------------
  -- Null while they are still filling it in. Set once, when they submit, and
  -- it is what puts them in front of an admin.
  add column if not exists submitted_at timestamptz;

comment on column investors.contact_name is
  'The person we deal with at the company. This is the name the admin user '
  'list shows for an investor — a trader has their own name, an investor has '
  'a company and a contact, and the contact is the human being.';

comment on column investors.submitted_at is
  'When the application was submitted for review. Null means still being '
  'filled in — every field is nullable so it can be saved and returned to. '
  'Submitting does NOT activate anything: an admin reviews it and links the '
  'broker account, and only then does status become linked.';

create index if not exists investors_submitted_idx
  on investors (submitted_at desc)
  where submitted_at is not null and status = 'pending';


-- ---------------------------------------------------------------------------
-- Ownership — directors and anyone over 25%.
--
-- A child table rather than columns, because there are several per company
-- and a schema with owner_1_name through owner_5_name is a schema that runs
-- out exactly when a company is complicated enough to matter.
-- ---------------------------------------------------------------------------

create table if not exists investor_owners (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references investors(id) on delete cascade,
  full_name text not null,
  -- Percentage held, 0-100. Null for a director who holds nothing, which is
  -- a real and common case — directorship and ownership are different things.
  share_percent numeric(5, 2),
  constraint investor_owners_share_range check (
    share_percent is null or (share_percent >= 0 and share_percent <= 100)
  ),
  is_director boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table investor_owners is
  'Directors and anyone holding over 25% of an investor company. Collected at '
  'signup because it is far easier to ask than to chase afterwards.';

create index if not exists investor_owners_investor_idx
  on investor_owners (investor_id);

alter table investor_owners enable row level security;

-- Their own company's owners, and only while the application is still open.
-- Once an admin has linked the account the list is a record, not a draft.
drop policy if exists "investor owners self" on investor_owners;
create policy "investor owners self" on investor_owners
  for all to authenticated
  using (
    investor_id in (
      select id from investors
       where user_id = auth.uid() and account_type = 'investor'
    )
  )
  with check (
    investor_id in (
      select id from investors
       where user_id = auth.uid()
         and account_type = 'investor'
         and linked_at is null
    )
  );

drop policy if exists "investor owners admin" on investor_owners;
create policy "investor owners admin" on investor_owners
  for all to authenticated
  using (is_admin())
  with check (is_admin());

grant select, insert, update, delete on investor_owners to authenticated;


-- ---------------------------------------------------------------------------
-- What an applicant may write on their own row.
--
-- investors uses COLUMN-LEVEL grants, so a column with no grant is refused
-- however permissive the policy is — that is what broke signup last week, and
-- it is why every new column is listed here explicitly.
--
-- NOT GRANTED, on purpose: status, linked_at, vantage_account_id. Those are
-- how an application becomes a live trading relationship, and they stay with
-- the admin who reviews it.
-- ---------------------------------------------------------------------------

grant update (
  company_name, company_reg_number, company_country, company_state,
  company_address, company_tax_id, company_nature, company_website,
  contact_name, contact_role, contact_email, contact_phone,
  contact_may_instruct, instructing_party,
  intended_amount_usd, source_of_funds, preferred_currency,
  wants_account_opened, incorporation_cert_path,
  submitted_at
) on investors to authenticated;

-- The two new agreements, separately: they follow the risk_acknowledged_at
-- pattern and their policy permits only null -> a value.
grant update (management_agreement_at, terms_accepted_at)
  on investors to authenticated;

-- Filling in the application. Allowed while it is theirs and not yet linked —
-- after that it is a record of what was agreed, and editing it would change
-- the terms of a live relationship from the outside.
drop policy if exists "investors fill application" on investors;
create policy "investors fill application" on investors
  for update to authenticated
  using (
    user_id = auth.uid()
    and account_type = 'investor'
    and linked_at is null
  )
  with check (
    user_id = auth.uid()
    and account_type = 'investor'
  );

comment on policy "investors fill application" on investors is
  'An investor fills in their own application while it is unlinked. The '
  'columns they may touch are set by the column grants above — status, '
  'linked_at and vantage_account_id are deliberately not among them, so '
  'nobody can self-activate into a live trading relationship.';
