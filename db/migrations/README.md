# Migrations

Run them in the Supabase SQL editor, lowest number first. Every one is additive
and safe to re-run.

## This database is shared. Read this before adding a file.

One Supabase project serves three codebases:

| Codebase | Owns | Prefix |
|---|---|---|
| `trading_bot` | the desk tables | `bot_*`, numbered `001`–`017` |
| `highscore-tech-web` | the company site: users, staff, courses | bare names, in `schema.sql` |
| `rm-web` (this one) | highzcore.com investor platform | `p2_*` files |

The bot's `db/migrations/README.md` records what happens when two people number
in parallel: `004`, `005`, `006` and `007` each exist twice, and "did you run
007?" stopped having one answer. That was two people in **one** repo. We now
have three repos writing to one database.

So our files are prefixed `p2_` and numbered separately. A `p2_` number can
never collide with a bot number, because it is not the same namespace.

**Rule: additive only.** We create new tables. We do not alter, drop or
re-policy anything owned by the other two. If something existing is genuinely in
the way, that is a conversation with Victor, not a migration.

## Auth is shared, and that is not a choice we get to make

`auth.users` is one namespace across the whole project. `highscore-tech-web`
puts an `AFTER INSERT` trigger on it (`on_auth_user_created`) which mirrors every
new signup into `public.users` with `role = 'student'`.

That trigger fires for **our** signups too. An investor who registers at
highzcore.com gets a `public.users` row and shows up in the academy's user list
as a student. We cannot fix this from here without altering a table we do not
own.

What this means in practice:

- `investors.user_id` references `auth.users(id)`, not `public.users(id)`. Our
  table does not depend on a row the other site's trigger happens to create.
- Being an investor is defined by having a row in `investors` — never by
  anything in `public.users`.
- Tell Victor. The options are to live with it, filter it on the company site,
  or move Product 2 to its own Supabase project. All three are his call.

## Files

| # | File | Adds |
|---|---|---|
| p2_001 | `p2_001_investors.sql` | the `investors` table and its RLS (P2-107) |
