-- ---------------------------------------------------------------------------
-- The blog and the documentation.
--
-- Esther: "we have to add blogs and doc on admin so she can add to it."
-- Olivia's half of HS-WEB-v1 is the content — "nobody explains what we do
-- better than the person who checks it works" — and she had nowhere to put
-- it. Both pages described themselves and led to nothing.
--
-- ONE TABLE, TWO DOORS, and that is a decision rather than a shortcut. A blog
-- post and a documentation page are the same shape: a title, a slug, a
-- summary, a markdown body, a cover, a published flag and a date. The only
-- real difference is which subdomain serves it and how it is ordered — blog
-- newest first, docs in a deliberate sequence. Two tables would be two
-- migrations, two admin screens and two sets of policies that drift.
--
-- `kind` carries that difference, and it is CHECKed rather than free text so
-- a typo cannot create a third category nobody renders.
--
-- DOCS ARE GROUPED, blog posts are not. `section` lets the documentation sit
-- under headings — "Getting started", "Managed trading" — and is simply null
-- on a post.
--
-- Same publish rule as the portfolio: published is public, drafts belong to
-- whoever may manage them, and it is false by default. Writing in the open
-- is worse than not writing.
--
-- Additive and safe to re-run.
-- ---------------------------------------------------------------------------

create table if not exists posts (
    id          uuid primary key default gen_random_uuid(),
    kind        text not null check (kind in ('blog', 'doc')),
    slug        text not null,
    title       text not null,
    -- The line under the title in a list. Required: a list of titles with no
    -- explanation is a table of contents, not something anybody reads.
    excerpt     text not null,
    body_md     text,
    cover_image_url text,
    -- Docs only. Null on a blog post.
    section     text,
    -- Who wrote it. Free text rather than a user reference: a post can be by
    -- somebody who has left, and the byline should not change when it
    -- happens.
    author      text,
    -- Hand-ordered, for docs. Blog posts use published_at.
    sort_order  integer not null default 0,
    published   boolean not null default false,
    -- Set when it is first published, and kept afterwards. The DATE a post
    -- went out does not change because somebody fixed a typo in it.
    published_at timestamptz,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),

    -- A slug is unique WITHIN its kind: /blog/getting-started and
    -- /docs/getting-started are different pages and both are reasonable.
    constraint posts_slug_per_kind unique (kind, slug)
);

create index if not exists posts_list_idx
    on posts (kind, published, sort_order, published_at desc);

alter table posts enable row level security;

drop policy if exists posts_public_read on posts;
create policy posts_public_read on posts
    for select using (published = true);

-- The same permission as the portfolio. All of it is "what we show the
-- world", and splitting it would mean granting three things to let one
-- person do one job.
drop policy if exists posts_manage on posts;
create policy posts_manage on posts
    for all
    using (admin_has('portfolio.manage'))
    with check (admin_has('portfolio.manage'));

grant select on posts to anon, authenticated;
grant insert, update, delete on posts to authenticated;

comment on table posts is
  'Blog posts and documentation pages (HS-WEB-v1). kind decides which door '
  'serves it. Published rows are public; drafts need portfolio.manage.';

do $$
begin
  raise notice 'posts ready — blog and docs can be written from the admin now.';
end$$;
