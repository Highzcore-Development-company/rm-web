-- ---------------------------------------------------------------------------
-- P2-601 / P2-605 / P2-607 — developer API keys, rate limiting, usage.
--
-- KEYS ARE STORED HASHED AND NEVER RECOVERABLE. We show the key once, at
-- creation, and keep only its SHA-256. A leaked database then yields no
-- working credentials, and "I lost my key" is answered by rotating, not by us
-- reading it back — which is the honest answer anyway, because we cannot.
--
-- Additive and safe to re-run.
-- ---------------------------------------------------------------------------

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),

  -- Keys belong to an investor. A developer must have an account; anonymous
  -- key issuance is how you end up running a free public API by accident.
  investor_id uuid not null references investors(id) on delete cascade,

  -- What the developer called it. Theirs, so they can tell two keys apart.
  name text not null,
  constraint api_keys_name_not_blank check (length(trim(name)) > 0),

  -- SHA-256 of the full key, hex. Never the key itself.
  key_hash text not null unique,

  -- First characters, shown in the UI so a key is identifiable in a list
  -- without being usable. Not a secret.
  key_prefix text not null,

  -- Null until revoked. Revoked keys are kept, not deleted: usage rows point
  -- at them, and "which key made these calls" must stay answerable.
  revoked_at timestamptz,
  last_used_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists api_keys_investor_idx on api_keys (investor_id);
-- The lookup on every request: hash the presented key, find a live row.
create index if not exists api_keys_live_idx on api_keys (key_hash)
  where revoked_at is null;

comment on table api_keys is
  'Developer API keys. Stored hashed; the plaintext is shown once and never again.';

drop trigger if exists trg_api_keys_updated_at on api_keys;
create trigger trg_api_keys_updated_at
  before update on api_keys
  for each row execute function set_updated_at();


-- ---------------------------------------------------------------------------
-- Usage, bucketed by minute.
--
-- One row per key per minute, so the rate limiter reads a single row and the
-- usage dashboard sums them. A log of individual calls would be far larger and
-- answer no question we actually ask.
-- ---------------------------------------------------------------------------

create table if not exists api_usage (
  api_key_id uuid not null references api_keys(id) on delete cascade,
  -- Truncated to the minute.
  window_start timestamptz not null,
  calls integer not null default 0,
  primary key (api_key_id, window_start)
);

create index if not exists api_usage_window_idx on api_usage (window_start desc);


-- ---------------------------------------------------------------------------
-- The rate limiter. One call, one row, atomic.
--
-- SECURITY DEFINER: the API route runs before any user session exists — the
-- caller is a key, not a person — so this cannot rely on auth.uid().
--
-- Returns the call count INCLUDING this one. The caller compares it to the
-- limit. Doing the increment and the check in one statement is the point: two
-- statements race, and a racing rate limiter is not one.
-- ---------------------------------------------------------------------------

create or replace function record_api_call(p_key_hash text, p_limit integer)
returns table (allowed boolean, calls integer, key_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key_id uuid;
  v_calls integer;
  v_window timestamptz := date_trunc('minute', now());
begin
  select id into v_key_id
    from api_keys
   where key_hash = p_key_hash
     and revoked_at is null;

  if v_key_id is null then
    -- No such key, or revoked. Says nothing about which — an attacker should
    -- not learn that a key once existed.
    return query select false, 0, null::uuid;
    return;
  end if;

  insert into api_usage (api_key_id, window_start, calls)
  values (v_key_id, v_window, 1)
  on conflict (api_key_id, window_start)
    do update set calls = api_usage.calls + 1
  returning api_usage.calls into v_calls;

  -- last_used_at is for the developer's own dashboard, not for billing, so a
  -- lost update under concurrency costs nothing.
  update api_keys set last_used_at = now() where id = v_key_id;

  return query select v_calls <= p_limit, v_calls, v_key_id;
end;
$$;

revoke all on function record_api_call(text, integer) from public, anon, authenticated;

comment on function record_api_call(text, integer) is
  'Increments and checks in one statement. Service role only. Returns calls incl. this one.';


-- ---------------------------------------------------------------------------
-- RLS — a developer sees their own keys and their own usage, and nothing else.
-- ---------------------------------------------------------------------------

alter table api_keys enable row level security;
alter table api_usage enable row level security;

revoke all on api_keys from anon, authenticated;
revoke all on api_usage from anon, authenticated;

-- Read only. Issuing and revoking go through server actions that hash the key
-- and write with the service role — a client must never be able to insert a
-- row whose hash it chose.
grant select on api_keys to authenticated;
grant select on api_usage to authenticated;

drop policy if exists "api_keys self read" on api_keys;
create policy "api_keys self read" on api_keys
  for select to authenticated
  using (owns_investor(investor_id) or is_admin());

drop policy if exists "api_usage self read" on api_usage;
create policy "api_usage self read" on api_usage
  for select to authenticated
  using (
    is_admin()
    or exists (
      select 1 from api_keys k
       where k.id = api_usage.api_key_id
         and owns_investor(k.investor_id)
    )
  );
