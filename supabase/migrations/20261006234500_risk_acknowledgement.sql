-- ---------------------------------------------------------------------------
-- P2-104 — record that the risk disclosure was acknowledged.
--
-- The acknowledgement was a checkbox inside the email signup form, which meant
-- anyone arriving through Google never saw it. The ticket says the disclosure
-- is "shown during signup", and a control that one of two signup routes skips
-- does not satisfy that.
--
-- A client-side checkbox is also not evidence. If an investor later says they
-- were never warned, "the button was disabled until they ticked it" is an
-- assertion about code that has since changed. A timestamp written server-side
-- is a record.
--
-- Additive and safe to re-run.
-- ---------------------------------------------------------------------------

alter table investors
  add column if not exists risk_acknowledged_at timestamptz;

comment on column investors.risk_acknowledged_at is
  'When the risk disclosure was acknowledged. Server-written; gates access to the app.';

-- Investors may set it on their own row, and only from null. Without the null
-- condition an investor could rewrite the date later, which turns the record
-- into something they control.
drop policy if exists "investors self acknowledge risk" on investors;
create policy "investors self acknowledge risk" on investors
  for update to authenticated
  using (user_id = auth.uid() and risk_acknowledged_at is null)
  with check (user_id = auth.uid());

grant update (risk_acknowledged_at) on investors to authenticated;
