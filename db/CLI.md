# The Supabase CLI

rm-web is linked to the CLI and all migrations are applied through it. Done on
6 Oct 2026.

## What is set up

- `supabase` is a dev dependency, so everyone gets the same version.
- `supabase/config.toml` — `project_id = "rm-web"`.
- `supabase/migrations/` — timestamped files, applied in order.
- Linked to project `wprdtdlvyotfdkvxexxi` (rm-web).

The CLI keeps a `supabase_migrations.schema_migrations` table in the database,
so "has this been applied to production?" is a question you can ask rather than
something you check by looking.

## If you are setting this up on another machine

```bash
npm install
npx supabase login
npx supabase link --project-ref wprdtdlvyotfdkvxexxi
```

`link` asks for the **database password** — the one on Settings → Database, not
the anon key.

## Day to day

```bash
npx supabase migration new add_something   # creates a timestamped empty file
npx supabase db push                       # applies what is missing
npx supabase migration list                # local vs remote, side by side
```

## Keep the local test harness

`db/test/` runs migrations against a throwaway Postgres with only what a fresh
Supabase project provides. The CLI does not replace it: `db push` tells you a
migration *applied*, not that the policies do what they claim. The useful checks
are the ones that assert a write is **refused** — an investor cannot set their
own status, cannot claim another's account, cannot bank a payment twice.

The harness reads from `supabase/migrations/`. Keep running it before every push.

## Two projects

rm-server is a separate project with its own migrations, owned by the bot. If it
is ever linked from a repo, link it from the bot's repo — never this one. A
`db push` from here must not be able to reach the bot's schema.
