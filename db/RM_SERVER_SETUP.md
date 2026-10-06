# Standing rm-server up — notes for Victor

Not our migration to run. rm-server is the bot's project and Epic 7 is yours;
this app deliberately holds only rm-server's **anon key**, so it has no rights
to create anything there. What follows is a dry run done on a throwaway
Postgres so the real one has no surprises in it.

Tested 6 Oct 2026 against `postgres:16-alpine` seeded with only what a fresh
Supabase project provides.

## The order that works

```
1. db/schema.sql
2. every file in db/migrations/ in sorted order, EXCEPT 001
```

That produces **16 objects**: 14 tables and 2 views.

```
bot_bars              bot_notify_log      bot_symbols
bot_commands          bot_predictions     bot_trade_analysis
bot_equity_snapshots  bot_proposals       bot_trades
bot_market_state      bot_quotes          bot_v_daily_pnl      (view)
bot_model_runs        bot_settings        bot_v_open_positions (view)
                      bot_symbol_config
```

## Two things that bite, both found in the dry run

**`001_market_state_overhaul.sql` fails on top of `schema.sql`.**

```
ERROR: constraint "bot_market_state_state_chk" for relation
       "bot_market_state" already exists
```

`schema.sql` is the consolidated current state and already contains what 001
adds. On an existing database this never shows up, because 001 ran long before
schema.sql was written. On a *fresh* project, applying both is a collision.

Worth noting because `db/migrations/README.md` says every migration is
"additive and safe to re-run". 001 is not, at least not against schema.sql.
Either fold that claim back to the migrations that honour it, or make 001 use
`if not exists`.

**`010_trade_analysis.sql` needs Supabase storage.**

```
ERROR: relation "storage.buckets" does not exist
```

It inserts a storage bucket. That schema exists on real Supabase and not on
bare Postgres, so this one is a false alarm here — it should apply fine on
rm-server. Flagged only so the dry run's output is not mistaken for a problem.

## What we need from rm-server, and why

The performance page (E4) and the investor dashboard (E5) are built and
currently render "unavailable", because rm-server exposes nothing to its anon
key. Three objects would light them up:

| Object | Used for |
|---|---|
| `bot_equity_snapshots` | the public equity curve (P2-401) |
| `bot_trades` | closed-trade history (P2-404, P2-504) |
| `bot_v_open_positions` | live positions (P2-503) |

**Not direct table access.** What E4 publishes is meant to be public, and what
E5 shows investors is a mirror of the master — neither needs row-level access
to the desk's tables. A read-only view per item, exposed to `anon`, is the
right shape: it lets you choose exactly which columns leave the project.

Specifically, please **withhold lot sizes and account balances**. P2-404 is
anonymised on purpose — those two columns let anyone infer the master's account
size, and from that every investor's allocation.

## Before cutting the bot over

The schema landing and the bot's connection string changing are one operation,
not two. Between them the bot writes to one database while the other looks
live, and that is exactly the split record P2-708 is about. Whatever the plan,
they should happen together, and the old record should be tagged or cleared in
the same pass.
