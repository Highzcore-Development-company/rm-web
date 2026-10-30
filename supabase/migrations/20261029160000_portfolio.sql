-- ---------------------------------------------------------------------------
-- HS-WEB-v1 — the portfolio.
--
-- "Add and manage the projects in our portfolio — what we show the world we
-- have built."
--
-- TWO AUDIENCES, ONE TABLE. Staff add and edit; the public reads. So the
-- policies are asymmetric on purpose: anyone may read a PUBLISHED project
-- because that is the point of a portfolio, and only portfolio.manage may
-- write or see an unpublished one. A draft case study is not public, and
-- "published" is the switch that decides.
--
-- THE SHAPE IS BORROWED FROM highscore-tech-web's portfolio_projects, which
-- is already in production and already answers the questions a case study
-- needs. Taken: slug, title, client, summary, markdown body, tech stack,
-- category, images, year, external link, sort order, published.
--
-- NOT TAKEN: video_url. Nothing in HS-WEB-v1 asks for showcase video and a
-- column nobody fills is a column somebody later has to explain. Easy to add
-- the day it is wanted.
--
-- IMAGES ARE URLs, NOT UPLOADS, in this first version. rm-web has no storage
-- bucket configured — that is a bucket plus its own policies, and it is the
-- one part of this that is not simply another table. A URL field works today
-- with an image hosted anywhere, and swapping it for an upload later changes
-- the form, not the schema.
--
-- Additive and safe to re-run.
-- ---------------------------------------------------------------------------

create table if not exists portfolio_projects (
    id              uuid primary key default gen_random_uuid(),
    -- The public URL. Unique because two projects cannot share an address.
    slug            text not null unique,
    title           text not null,
    -- Nullable: our own products are in the portfolio too, and they have no
    -- client. "Internal" is a real answer, not a missing one.
    client          text,
    summary         text not null,
    -- The full case study, markdown. Optional — a project can be a line and
    -- a picture before anybody has written it up.
    body_md         text,
    tech_stack      text[] not null default array[]::text[],
    category        text,
    cover_image_url text,
    images          text[] not null default array[]::text[],
    year            integer,
    -- The live thing, if it is public.
    external_url    text,
    -- Hand-ordered. A portfolio is a pitch, so the order is an argument
    -- somebody makes rather than whatever the dates happen to say.
    sort_order      integer not null default 0,
    -- FALSE BY DEFAULT, unlike the project this is borrowed from. A
    -- half-written case study going live the moment it is saved is the wrong
    -- way round; publishing should be a decision.
    published       boolean not null default false,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists portfolio_projects_order_idx
    on portfolio_projects (published, sort_order, year desc);

alter table portfolio_projects enable row level security;

-- Anyone, signed in or not, may read what has been published. This is the
-- public half of the table and the reason it exists.
drop policy if exists portfolio_public_read on portfolio_projects;
create policy portfolio_public_read on portfolio_projects
    for select
    using (published = true);

-- Staff who were granted it see everything, including drafts, and are the
-- only ones who may write.
drop policy if exists portfolio_manage on portfolio_projects;
create policy portfolio_manage on portfolio_projects
    for all
    using (admin_has('portfolio.manage'))
    with check (admin_has('portfolio.manage'));

grant select on portfolio_projects to anon, authenticated;
grant insert, update, delete on portfolio_projects to authenticated;

comment on table portfolio_projects is
  'What we show the world we have built (HS-WEB-v1). Published rows are public; '
  'drafts and writes need portfolio.manage.';

do $$
begin
  raise notice
    'Portfolio ready. Grant portfolio.manage to whoever maintains it; drafts are invisible until published.';
end$$;
