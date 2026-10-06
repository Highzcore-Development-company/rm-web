# Testing a migration before it touches the real database

The Supabase project is shared with the trading desk and the company site. A
migration that errors halfway, or a policy that is subtly too permissive, is not
something to discover by pasting into the production SQL editor.

Run it against a throwaway Postgres first. Docker, about thirty seconds:

```bash
docker run -d --rm --name p2pg -e POSTGRES_PASSWORD=pw postgres:16-alpine
until docker exec p2pg pg_isready -U postgres; do sleep 1; done

docker cp db/test/stubs.sql p2pg:/stubs.sql
docker cp supabase/migrations/20261006120100_investors.sql p2pg:/mig.sql
docker cp db/test/p2_001_investors.test.sql p2pg:/tests.sql

docker exec p2pg psql -U postgres -v ON_ERROR_STOP=1 -q -f /stubs.sql
docker exec p2pg psql -U postgres -v ON_ERROR_STOP=1 -q -f /mig.sql
docker exec p2pg psql -U postgres -q -f /tests.sql

docker rm -f p2pg
```

On Git Bash, prefix with `MSYS_NO_PATHCONV=1` or it rewrites `/stubs.sql` into a
Windows path and psql cannot find the file.

## What the files are

`stubs.sql` — the minimum the real project already provides: `auth.users`,
`auth.uid()`, the `anon`/`authenticated` roles, `public.users`, `is_admin()` and
`set_updated_at()`. Not a copy of the schema. Enough for our migration's
dependencies to resolve, and no more, so a test failure means our migration is
wrong rather than our stub being out of date.

`auth.uid()` reads the `test.user_id` session setting, so a test impersonates a
user with `set role authenticated; set "test.user_id" = '<uuid>';`.

`*.test.sql` — one file per migration. Each numbered check prints its result;
the ones that are supposed to fail say so in their heading, so an ERROR line
under "expect: check violation" is a pass, not a problem.

## Rules worth keeping

Run the migration **twice**. Every one of ours claims to be safe to re-run, and
that claim is worth a command rather than a comment.

Test what should be *refused*, not only what should work. The useful checks in
`p2_001` are the ones that fail: an investor cannot set their own status, cannot
claim an account someone else holds, and cannot swap out a confirmed link. Those
are the properties the money depends on, and they are the ones a later edit will
quietly break.
