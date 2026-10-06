-- ---------------------------------------------------------------------------
-- Email verification, sent by US over our own SMTP.
--
-- Supabase's auth email is not used at all — not its default sender, not its
-- templates. We issue the code, we store it, we check it, and nodemailer
-- delivers it through the same SMTP server the company site uses.
--
-- WHY A SEPARATE FLAG RATHER THAN auth.users.email_confirmed_at. Supabase is
-- configured to auto-confirm, because otherwise it would try to send its own
-- mail and refuse the signup when it could not. So its idea of "confirmed"
-- means nothing here. Ours is the one that gates access, and it lives on a
-- table we own.
--
-- THE CODE IS STORED HASHED. It is short-lived and only six digits, but it is
-- a credential: anyone who could read the table could verify someone else's
-- address and take over the account before they ever saw the email.
--
-- Additive and safe to re-run.
-- ---------------------------------------------------------------------------

alter table investors
  add column if not exists email_verified_at timestamptz;

comment on column investors.email_verified_at is
  'Set when OUR six-digit code was accepted. Supabase auto-confirms, so its own flag is not meaningful here.';

create table if not exists email_verifications (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- SHA-256 of the six digits. Never the digits.
  code_hash text not null,

  expires_at timestamptz not null,

  -- Six digits is a million guesses; without a ceiling that is minutes of
  -- scripted work. Counted server-side, because a client-side limit is a
  -- suggestion.
  attempts integer not null default 0,
  constraint email_verifications_attempts_sane check (attempts >= 0),

  -- Rate-limits resending. Without it the button is a free way to send mail
  -- from our domain to any address someone types.
  last_sent_at timestamptz not null default now(),

  created_at timestamptz not null default now()
);

comment on table email_verifications is
  'One pending code per user, hashed. Replaced on resend, deleted on success.';

alter table email_verifications enable row level security;

-- No policies: service role only. Nothing client-side ever reads a code, not
-- even its own — verification happens on the server.
revoke all on email_verifications from anon, authenticated;
