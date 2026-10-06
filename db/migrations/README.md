# Migrations have moved

They now live in **`supabase/migrations/`** and are applied by the Supabase CLI,
not pasted into the SQL editor. See [`../CLI.md`](../CLI.md).

```bash
npx supabase migration list   # local vs remote, side by side
npx supabase db push          # apply what is missing
npx supabase migration new <name>
```

This folder keeps only this note. The local test harness in [`../test/`](../test/)
still runs the SQL against a throwaway Postgres before anything reaches a real
project — `db push` tells you a migration *applied*, not that its policies do
what they claim.

## Two projects, and which is which

| Project | Ref | Owns | We |
|---|---|---|---|
| **rm-web** | `wprdtdlvyotfdkvxexxi` | auth, investors, subscriptions, invoices, notification preferences, candle ticks for the site's charts | own it, write it |
| **rm-server** | `ttpbkkxlrrdstkmfbose` | the bot: equity snapshots, trades, live positions, market state | **read only** |

The dividing line: **if the bot writes it while trading, it is rm-server. If a
person or the website writes it, it is rm-web.**

Everything under `supabase/migrations/` targets rm-web, and the CLI is linked to
rm-web. Keep it that way — rm-server should be linked from the bot's repo, never
from here, so a stray `db push` cannot reach the bot's schema.

We read rm-server through `src/lib/supabase/rm-server.ts` with its anon key and
write to it never. If a read needs more than that key can see, the fix is a
policy or a view on rm-server, not a stronger key over here.

## Ordering

`20261006120000_bootstrap` must stay first. It creates `set_updated_at()` and
`is_admin()`; the later files were originally written against the company site's
shared project, which already had both, and they fail without it.

## What the split fixed

The company site puts an `AFTER INSERT` trigger on `auth.users` that mirrors
every signup into its own `users` table as a `student`. On a shared project,
every investor signing up at highzcore.com would have landed in the academy's
user list. Separate projects remove that rather than work around it.

Admins are an explicit `app_admins` table rather than a role on somebody else's
users table. Rows are added by hand in the dashboard — there is no in-app grant
path, deliberately.

## State as of 6 Oct 2026

All five migrations are applied to rm-web and verified against the live API:
every table exists, and the anon key is refused both read and write on all five.

rm-server exposes **nothing** yet — the bot has not been migrated onto it. Until
it is, the performance page (E4) and the dashboard's live positions (E5) render
their unavailable states rather than invented figures.
