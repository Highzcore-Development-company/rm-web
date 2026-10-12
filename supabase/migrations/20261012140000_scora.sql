-- ---------------------------------------------------------------------------
-- HS-BOT-v4 §3 — Scora: conversations, usage, and the paid gate.
--
-- Scora is what a TRADER buys. The chat panel has existed since the desk was
-- built with its input disabled; this is the state behind it.
--
-- THREE THINGS:
--
--   scora_conversations  a thread. Survives a refresh, which is the point.
--   scora_messages       the turns in it, with the token cost of each.
--   can_use_scora()      the gate: a paid trader, enforced HERE and not only
--                        in the interface.
--
-- THE GATE IS THE IMPORTANT PART. "Gate it on a paid subscription, in the
-- database and not only in the interface" — because the interface is a
-- client-side check and the route is a URL anybody can POST to. Every policy
-- below calls the same function the route calls, so the two cannot disagree.
--
-- WHY TOKENS ARE COUNTED PER MESSAGE: "we need to know what a subscriber costs
-- us before we find out the expensive way." Stored on the row that caused the
-- cost rather than a running total, so a bad month can be read back by day,
-- by user, or by conversation without having kept a second tally.
--
-- Additive and safe to re-run.
-- ---------------------------------------------------------------------------

create table if not exists scora_conversations (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references investors(id) on delete cascade,
  -- First few words of the opening question. Written by us, not the model:
  -- asking the model to name a thread costs a call and can return anything.
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scora_conversations_investor_idx
  on scora_conversations (investor_id, updated_at desc);

create table if not exists scora_messages (
  id bigserial primary key,
  conversation_id uuid not null
    references scora_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- Null on a user turn; the model's cost on an assistant turn.
  prompt_tokens integer,
  completion_tokens integer,
  -- Which model answered. Pinned per row because we will change models and a
  -- cost read back next quarter has to know which one it was priced at.
  model text,
  created_at timestamptz not null default now()
);

create index if not exists scora_messages_conversation_idx
  on scora_messages (conversation_id, created_at);

create index if not exists scora_messages_cost_idx
  on scora_messages (created_at desc)
  where completion_tokens is not null;


-- ---------------------------------------------------------------------------
-- The gate.
--
-- A trader with a live subscription. Both halves matter:
--
--   account_type = 'trader'  — an investor is not sold Scora. The bot does
--                              their analysis; that is the product they chose.
--   a confirmed, unexpired subscription — this is the thing they pay for.
--
-- SECURITY DEFINER so it can read subscriptions regardless of the caller's own
-- policies, and stable so Postgres may cache it within a statement.
-- ---------------------------------------------------------------------------

create or replace function can_use_scora()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from investors i
      join subscriptions s on s.investor_id = i.id
     where i.user_id = auth.uid()
       and i.account_type = 'trader'
       and i.disabled_at is null
       and i.deleted_at is null
       and s.status = 'confirmed'
       and s.expires_at > now()
  );
$$;

comment on function can_use_scora() is
  'True for a trader with a live subscription. The same check the API route '
  'makes, so the interface and the database cannot disagree. Called by every '
  'scora_* policy.';

grant execute on function can_use_scora() to authenticated;


-- ---------------------------------------------------------------------------
-- RLS. Your own threads, and only while you are paying.
--
-- Note what happens when a subscription lapses: existing rows stop being
-- readable rather than being deleted. The history is kept — they may come
-- back, and deleting somebody's conversations because a card expired would be
-- destroying their data over a billing event.
-- ---------------------------------------------------------------------------

alter table scora_conversations enable row level security;
alter table scora_messages enable row level security;

drop policy if exists "scora conversations own" on scora_conversations;
create policy "scora conversations own" on scora_conversations
  for all to authenticated
  using (
    can_use_scora()
    and investor_id in (select id from investors where user_id = auth.uid())
  )
  with check (
    can_use_scora()
    and investor_id in (select id from investors where user_id = auth.uid())
  );

drop policy if exists "scora messages own" on scora_messages;
create policy "scora messages own" on scora_messages
  for all to authenticated
  using (
    can_use_scora()
    and conversation_id in (
      select c.id from scora_conversations c
       join investors i on i.id = c.investor_id
      where i.user_id = auth.uid()
    )
  )
  with check (
    can_use_scora()
    and conversation_id in (
      select c.id from scora_conversations c
       join investors i on i.id = c.investor_id
      where i.user_id = auth.uid()
    )
  );

-- Admins read, never write. A support question is "what did Scora tell them",
-- and answering it must not include the power to edit the answer.
drop policy if exists "scora conversations admin read" on scora_conversations;
create policy "scora conversations admin read" on scora_conversations
  for select to authenticated using (is_admin());

drop policy if exists "scora messages admin read" on scora_messages;
create policy "scora messages admin read" on scora_messages
  for select to authenticated using (is_admin());

grant select, insert, update, delete on scora_conversations to authenticated;
grant select, insert on scora_messages to authenticated;
-- No update or delete on messages, for anyone. A transcript somebody can edit
-- is not a transcript — and "Scora told me to buy" is exactly the claim this
-- table has to be able to answer.
revoke update, delete on scora_messages from authenticated;
grant usage, select on sequence scora_messages_id_seq to authenticated;
