-- ---------------------------------------------------------------------------
-- HS-WEB-v1 — start of day and end of day.
--
-- Esther, 29 Oct, describing what Victor means by it: "SOD is a staff way of
-- describing what you will work on for the day, and EOD is what you achieved
-- out of what you worked on, even if it's all."
--
-- SO EOD IS NOT A SECOND BLANK BOX. It is answered AGAINST the morning's
-- list, which is the whole reason the pair is worth filing: planned versus
-- delivered, visible without anyone being asked. A free-text "what I did
-- today" would lose exactly the comparison the report exists to make.
--
-- Hence two tables rather than one row with two paragraphs in it:
--
--   staff_days    one row per person per day — when the plan was filed, when
--                 the day was closed off, and anything they want to add that
--                 is not about a single item.
--   staff_day_items  the list. Each carries what was planned and, at the end
--                 of the day, whether it happened.
--
-- ONE ROW PER PERSON PER DAY, enforced by a unique constraint rather than by
-- the app remembering. Two plans for the same Tuesday is not a thing that
-- should be representable.
--
-- THE DAY IS A date, NOT A timestamptz. "Which day is this report for" is a
-- calendar question, and storing an instant would make a report filed at
-- 00:30 belong to the previous day for some readers and not others.
--
-- WHO MAY SEE WHAT. A staff member sees their own, always — it is their work,
-- and filing a report you cannot read back is a form, not a record. Seeing
-- EVERYONE's is a permission, because that is a manager's view of the team
-- and not a default of being staff.
--
-- Additive and safe to re-run.
-- ---------------------------------------------------------------------------

create table if not exists staff_days (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users(id) on delete cascade,
    -- The calendar day this report is for. See the note above.
    day         date not null,
    -- Null until filed. The TIMES matter as much as the content: "filed the
    -- plan at 14:00" is a different day from "filed it at 08:30", and that is
    -- not visible from the text.
    sod_at      timestamptz,
    eod_at      timestamptz,
    -- Anything about the day that is not about one item — blocked on someone,
    -- half a day off, a meeting that ate the morning.
    note        text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),

    constraint staff_days_one_per_day unique (user_id, day)
);

create index if not exists staff_days_day_idx on staff_days (day desc);
create index if not exists staff_days_user_day_idx on staff_days (user_id, day desc);

create table if not exists staff_day_items (
    id          uuid primary key default gen_random_uuid(),
    day_id      uuid not null references staff_days(id) on delete cascade,
    -- What they said they would work on. Written in the morning.
    plan        text not null,
    -- Answered in the evening. NULL means the day is not closed off yet, and
    -- is deliberately not the same as false — "not done" is a report, "not
    -- answered" is an unfinished one.
    done        boolean,
    -- Why, when it is worth saying. Mostly empty, and that is fine.
    outcome     text,
    -- The order they were written in. A plan is a list, and a list that
    -- reorders itself between the morning and the evening is hard to read
    -- against.
    position    integer not null default 0,
    created_at  timestamptz not null default now()
);

create index if not exists staff_day_items_day_idx
    on staff_day_items (day_id, position);

alter table staff_days enable row level security;
alter table staff_day_items enable row level security;

-- ---------------------------------------------------------------------------
-- Who may read and write.
--
-- THE GATE IS HERE, NOT ONLY ON THE SCREEN. HS-WEB-v1: "A hidden section is
-- not a permission — the data behind it must refuse a staff member who was
-- not granted it."
-- ---------------------------------------------------------------------------

-- Their own, always. It is their work.
drop policy if exists staff_days_own on staff_days;
create policy staff_days_own on staff_days
    for all
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- Everybody's, for whoever was granted it. Read only: a manager reads the
-- team's reports, they do not write somebody else's day.
drop policy if exists staff_days_read_all on staff_days;
create policy staff_days_read_all on staff_days
    for select
    using (admin_has('reports.view_all'));

drop policy if exists staff_day_items_own on staff_day_items;
create policy staff_day_items_own on staff_day_items
    for all
    using (
        exists (
            select 1 from staff_days d
             where d.id = staff_day_items.day_id
               and d.user_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1 from staff_days d
             where d.id = staff_day_items.day_id
               and d.user_id = auth.uid()
        )
    );

drop policy if exists staff_day_items_read_all on staff_day_items;
create policy staff_day_items_read_all on staff_day_items
    for select
    using (admin_has('reports.view_all'));

grant select, insert, update, delete on staff_days to authenticated;
grant select, insert, update, delete on staff_day_items to authenticated;

-- ---------------------------------------------------------------------------
-- The permission.
--
-- Only the "see everyone's" half is a permission. Filing and reading your own
-- is not granted per person — every staff member has a day, and a report
-- nobody can file is not a section anyone would grant.
--
-- GIVEN TO NOBODY BY DEFAULT. Super admin holds it already (is_super
-- short-circuits the array), so Victor can read the team's reports the moment
-- this runs, and anyone else is a deliberate grant.
-- ---------------------------------------------------------------------------

comment on table staff_days is
  'One start-of-day / end-of-day report per staff member per day. EOD is answered '
  'against the SOD list, not written fresh — see staff_day_items.done.';

do $$
begin
  raise notice
    'SOD/EOD tables ready. Grant reports.view_all to whoever should read the whole team.';
end$$;
