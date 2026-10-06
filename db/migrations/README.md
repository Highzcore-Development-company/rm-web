# Migrations

Run them in the Supabase SQL editor, lowest number first. Every one is additive
and safe to re-run.

## Numbering

Our files are prefixed `p2_` and numbered separately from the bot's.

The bot's own `db/migrations/README.md` records what happens otherwise: `004`,
`005`, `006` and `007` each exist twice there, from two people numbering in
parallel, and "did you run 007?" stopped having one answer. A `p2_` number
cannot collide with a bot number because it is not the same namespace — and now
not even the same database.

Before adding a file: `ls db/migrations`, take the highest `p2_` number, add
one. Never reuse a number, even if the other one is on a branch that may not
ship.

## Two projects, and which is which

| Project | Owns | We |
|---|---|---|
| **rm-web** | this app: auth, investors, subscriptions, invoices | own it, write it |
| **rm-server** | the bot: equity snapshots, trades, live positions | **read only** |

Everything in this folder runs against **rm-web**. Nothing here is ever applied
to rm-server — the bot owns that schema and changes it on its own schedule.

We read rm-server through `src/lib/supabase/rm-server.ts` with its anon key, and
write to it never. If a read needs more than the anon key can see, the fix is a
policy or a view on rm-server, not a stronger key over here.

### Run p2_000 first

`p2_000_bootstrap.sql` creates `set_updated_at()` and `is_admin()`. The later
migrations were first written against the company site's shared project, which
already had both; a fresh rm-web does not, and p2_001 fails without them.

### What the split fixed

The company site puts an `AFTER INSERT` trigger on `auth.users` that mirrors
every signup into its own `users` table as a `student`. On a shared project,
every investor signing up at highzcore.com would have landed in the academy's
user list. Separate projects remove that rather than work around it.

Admins are now an explicit `app_admins` table rather than a role on somebody
else's users table. Rows are added by hand in the dashboard — there is no
in-app grant path, deliberately.

## Files

| # | File | Adds |
|---|---|---|
| p2_000 | `p2_000_bootstrap.sql` | set_updated_at(), app_admins, is_admin() — **run first** |
| p2_001 | `p2_001_investors.sql` | the `investors` table and its RLS (P2-107) |
| p2_002 | `p2_002_subscriptions.sql` | subscriptions, entitlement, idempotent activation (P2-302, P2-308, P2-309) |
| p2_003 | `p2_003_crypto_invoices.sql` | USDT TRC-20 invoices, one address per invoice (P2-306, P2-307) |
