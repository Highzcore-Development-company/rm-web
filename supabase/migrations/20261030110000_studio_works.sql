-- ---------------------------------------------------------------------------
-- Highscore Studio — the work.
--
-- HS-WEB-v1 gives the studio a door of its own, and /studio was the one page
-- with no proof on it at all. There is plenty: nine pieces in
-- highscore-tech-web's live database — Laughter Cave, BOLT, AOR Autos,
-- MTN, Chevron Comedy Club, Nhowel.
--
-- A SEPARATE TABLE FROM portfolio_projects, deliberately. The studio's work
-- is VIDEO with a poster frame, where the agency's is screenshots and a
-- written case study. Forcing both into one table would mean a row where
-- half the columns are always null and a page that has to ask which kind it
-- is holding.
--
-- cloudinary_id is NOT carried across. It is an id for highscore's own media
-- account, and the video_url and poster_url resolve on their own — a column
-- we cannot use is one somebody later has to explain.
--
-- PUBLISHED STATE COMES ACROSS AS-IS, including the one that is false. Eight
-- of these are live on highscore's site, so they are claims the company
-- already makes in public; the ninth is theirs to hold back and that is not
-- ours to reverse.
--
-- Idempotent on title: these have no slug of their own upstream.
-- ---------------------------------------------------------------------------

create table if not exists studio_works (
    id           uuid primary key default gen_random_uuid(),
    title        text not null unique,
    client       text,
    -- 'Advert', 'Jingle', 'Business' — the kind of piece, as the studio
    -- describes its own work.
    project_type text,
    summary      text,
    media_type   text,
    video_url    text,
    audio_url    text,
    -- The still shown before anything plays. Without one a video is a black
    -- rectangle until it loads, which reads as broken.
    poster_url   text,
    sort_order   integer not null default 0,
    published    boolean not null default false,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create index if not exists studio_works_order_idx
    on studio_works (published, sort_order);

alter table studio_works enable row level security;

-- Same shape as the portfolio: published is public, everything else needs
-- the permission. The gate is in the database, which is what HS-WEB-v1 asks
-- for in those words.
drop policy if exists studio_public_read on studio_works;
create policy studio_public_read on studio_works
    for select using (published = true);

drop policy if exists studio_manage on studio_works;
create policy studio_manage on studio_works
    for all
    using (admin_has('portfolio.manage'))
    with check (admin_has('portfolio.manage'));

grant select on studio_works to anon, authenticated;
grant insert, update, delete on studio_works to authenticated;

insert into studio_works
  (title, client, project_type, summary, media_type, video_url, audio_url,
   poster_url, sort_order, published)
values
  ($hs$Laughtercave X Highscore Studio$hs$, $hs$Laughter Cave$hs$, $hs$Business$hs$, $hs$Highscore Studio owns the sound$hs$,
   $hs$video$hs$, $hs$https://www.youtube.com/watch?v=GstSkyMkacs$hs$, null, $hs$https://i.ytimg.com/vi/GstSkyMkacs/hqdefault.jpg$hs$,
   0, true),
  ($hs$BOLT X HIGHSCORE STUDIO$hs$, $hs$BOLT$hs$, $hs$Advert$hs$, $hs$Highscore Studio made this beautiful masterpiece$hs$,
   $hs$video$hs$, $hs$https://www.youtube.com/watch?v=clMWG7ZoTFI$hs$, null, $hs$https://i.ytimg.com/vi/clMWG7ZoTFI/hqdefault.jpg$hs$,
   0, true),
  ($hs$AOR AUTOS X HIGHSCORE STUDIO$hs$, $hs$AOR AUTOS$hs$, $hs$Advert$hs$, $hs$Highscore Studio owns the Sound.$hs$,
   $hs$video$hs$, $hs$https://www.youtube.com/watch?v=Urq1ptOwlRQ$hs$, null, $hs$https://i.ytimg.com/vi/Urq1ptOwlRQ/hqdefault.jpg$hs$,
   0, true),
  ($hs$MTN IS 25$hs$, $hs$MTN$hs$, $hs$Advert$hs$, $hs$Highscorestudio made this Sound$hs$,
   $hs$video$hs$, $hs$https://www.youtube.com/watch?v=d7_tpl1Eh-k$hs$, null, $hs$https://i.ytimg.com/vi/d7_tpl1Eh-k/hqdefault.jpg$hs$,
   0, true),
  ($hs$Thehuntgameshow$hs$, $hs$Nons Miraj$hs$, $hs$Advert$hs$, $hs$Sound own by Highscore studio$hs$,
   $hs$video$hs$, $hs$https://www.youtube.com/watch?v=ILokXTBKMuY$hs$, null, $hs$https://i.ytimg.com/vi/ILokXTBKMuY/hqdefault.jpg$hs$,
   0, false),
  ($hs$Highscore Studio$hs$, $hs$Highscore Studio$hs$, $hs$Advert$hs$, $hs$Highscore studio turns your idea into music.$hs$,
   $hs$video$hs$, $hs$https://www.youtube.com/watch?v=UPMfUa4tdII$hs$, null, $hs$https://i.ytimg.com/vi/UPMfUa4tdII/hqdefault.jpg$hs$,
   0, true),
  ($hs$Nhowel Chic Beauty$hs$, $hs$Nhowel$hs$, $hs$Advert$hs$, $hs$Highscore Studio produced the song$hs$,
   $hs$video$hs$, $hs$https://www.youtube.com/watch?v=S7LjkvzDKIw$hs$, null, $hs$https://i.ytimg.com/vi/S7LjkvzDKIw/hqdefault.jpg$hs$,
   0, true),
  ($hs$Chevron Comedy Club$hs$, $hs$Chevron$hs$, $hs$Advert$hs$, $hs$Highscore Studio produce the sound$hs$,
   $hs$video$hs$, $hs$https://www.youtube.com/watch?v=oHseyJfG6aQ$hs$, null, $hs$https://i.ytimg.com/vi/oHseyJfG6aQ/hqdefault.jpg$hs$,
   0, true),
  ($hs$Deep study with me | 3 hours of deep study with me$hs$, $hs$Highscore studio$hs$, $hs$Jingle$hs$, $hs$A cool calm song$hs$,
   $hs$video$hs$, $hs$https://www.youtube.com/watch?v=YO3xSvNUECc$hs$, null, $hs$https://i.ytimg.com/vi/YO3xSvNUECc/hqdefault.jpg$hs$,
   0, true)
on conflict (title) do update set
  client       = excluded.client,
  project_type = excluded.project_type,
  summary      = excluded.summary,
  media_type   = excluded.media_type,
  video_url    = excluded.video_url,
  audio_url    = excluded.audio_url,
  poster_url   = excluded.poster_url,
  sort_order   = excluded.sort_order,
  published    = excluded.published,
  updated_at   = now();

do $$
declare
  n integer;
  p integer;
begin
  select count(*), count(*) filter (where published) into n, p from studio_works;
  raise notice '% studio work(s), % published.', n, p;
end$$;
