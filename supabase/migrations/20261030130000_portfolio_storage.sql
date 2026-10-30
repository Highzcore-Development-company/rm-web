-- ---------------------------------------------------------------------------
-- A place to put the pictures.
--
-- Esther: "Cover image URL — why URL? What if I want to upload the picture?"
--
-- Fair. A URL field was a workaround for rm-web having no storage, and it
-- asks somebody to go and host an image somewhere else first, which is not
-- a thing a person maintaining a portfolio should have to do. This creates
-- the bucket so the form can take a file.
--
-- PUBLIC BUCKET, because these images are the public portfolio. A private
-- bucket would mean signing every URL, those signatures expire, and a case
-- study whose pictures disappear after an hour is worse than no pictures.
-- Nothing confidential goes in here — the client names in the portfolio are
-- already on the page beside the image.
--
-- WRITES NEED portfolio.manage, READS NEED NOTHING. The same asymmetry as
-- the table itself: everybody may look, only the people who maintain it may
-- put something there or take it away. Enforced on storage.objects rather
-- than in the upload handler, so a direct call to the storage API is refused
-- the same as one from our form.
--
-- 10MB and images only. Both are enforced by the bucket, not by the browser
-- — a file-type check in JavaScript is a suggestion, and the bucket is the
-- thing that actually has to hold the file.
--
-- Additive and safe to re-run.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portfolio',
  'portfolio',
  true,
  10485760,                                   -- 10MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Anyone may look. This is the public portfolio.
drop policy if exists portfolio_images_read on storage.objects;
create policy portfolio_images_read on storage.objects
  for select
  using (bucket_id = 'portfolio');

-- Only the people who maintain it may add, replace or remove.
drop policy if exists portfolio_images_insert on storage.objects;
create policy portfolio_images_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'portfolio' and admin_has('portfolio.manage'));

drop policy if exists portfolio_images_update on storage.objects;
create policy portfolio_images_update on storage.objects
  for update to authenticated
  using (bucket_id = 'portfolio' and admin_has('portfolio.manage'))
  with check (bucket_id = 'portfolio' and admin_has('portfolio.manage'));

drop policy if exists portfolio_images_delete on storage.objects;
create policy portfolio_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'portfolio' and admin_has('portfolio.manage'));

do $$
begin
  raise notice
    'Bucket "portfolio" ready: public to read, portfolio.manage to write, 10MB, images only.';
end$$;
