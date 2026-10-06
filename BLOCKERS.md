# What I need to finish, and who has it

Status 6 Oct 2026. 41 of Esther's 46 tickets are done. Everything below is what
stands between here and the rest.

Grouped by who can unblock it, because that is the only grouping that gets
things moving.

---

## 1. Credentials and API access — needed for 5 tickets

### ALATPay → P2-304, P2-305

| Need | Note |
|---|---|
| `ALATPAY_API_KEY` | |
| `ALATPAY_BUSINESS_ID` | |
| `ALATPAY_WEBHOOK_SECRET` | if they sign callbacks |
| **Documentation for the virtual-account API** | **the actual blocker** |

The credentials alone are not enough. The brief is explicit that we use the API
that **returns a virtual account number per transaction**, not the popup SDK —
and the existing integration on the company site is the popup SDK, so there is
nothing to copy. I cannot write a request against an endpoint I have never
seen. A PDF, a Postman collection or a link to their docs all work.

### TRON → P2-306, P2-307

| Need | Note |
|---|---|
| `TRON_WATCH_XPUB` | the **account-level public xpub**, not the seed |
| `TRON_API_KEY` | TronGrid or equivalent, for the confirmation watcher |
| Confirmation count | defaulted to 20, matching MYPOKER |

**If this is MYPOKER's wallet, it must be a different account branch.**

Both products derive addresses from the xpub by index. Share one xpub and
MYPOKER's index 47 and ours are the *same address* — two unrelated invoices
against one address, which is precisely what `crypto_invoices` has a unique
constraint to prevent and what makes a payment impossible to attribute.

Same seed, same wallet, same recovery; different branch:

```
m/44'/195'/0'   MYPOKER     (whatever it already uses)
m/44'/195'/1'   Highzcore   (export the xpub for THIS account)
```

Nothing about MYPOKER changes. We need the account-level xpub for a branch it
does not use. Confirm which index MYPOKER is on before picking ours.

**Never send the seed phrase or a private key.** Receive addresses derive from
the public xpub alone. Sweeping funds needs the private key and is a separate
process with its own custody — not this app, and not this app's environment.

### Email provider → P2-310, **and signup**

Pick one: Resend, Postmark, or SES. Then two things:

1. SMTP credentials into **Supabase → Authentication → Emails → SMTP Settings**
2. An API key in the app env, for renewal reminders

This started as "reminders are blocked". It is now bigger: Supabase's built-in
sender allows a couple of emails an hour, so **every signup fails once that is
spent**. This is the single highest-value unblock on the list.

---

## 2. Business decisions — Victor

| # | Decision | Blocks | Cost of not deciding |
|---|---|---|---|
| D5 | Logo and brand kit | P2-001 | A text wordmark sits where a logo goes, on every page |
| — | **Vantage IB partner link** | P2-201 | **Commission leak — see below** |
| — | Vantage MAM manager ID | P2-202 | Investors cannot attach their account |
| — | Vantage minimum deposit, and ours | P2-206 | $200 / $1,000 are my guesses, shown as guidance |
| P2-003 | Chart palette: green/red or orange/grey | — | Measured: green/red separates by ΔE 5.0 under deuteranopia, below the usable floor. Built with the sign in the text so colour is never the only carrier, but the call is still open |
| D2 | Legal review of terms, privacy, API terms | P2-105, P2-608 | Pages carry a visible "draft" banner |
| D4 | Free vs paid API split | P2-604 | `/api/v1/signals` ships returning 403 |
| — | Grace period after expiry | P2-311 | Defaulted to 3 days |
| — | USD/NGN rate for quoting | P2-309 | Defaulted to ₦1,550, and it prints on invoices |

### The partner link is the urgent one

`NEXT_PUBLIC_VANTAGE_PARTNER_LINK` is empty, so "Open a Vantage account" falls
through to Vantage's generic homepage. **An investor who signs up through that
is not attributed to us.** The button looks like it works, which is what makes
it dangerous — nothing surfaces as broken, the commission simply never arrives.
One line to fix.

---

## 3. Bot side — Victor (Epic 7)

**P2-704, the equity feed.** Until snapshots stop silently stalling, the public
performance page renders its unavailable state rather than figures we cannot
stand behind. E4 is built and waiting on exactly this.

**rm-server has no tables.** The project (`ttpbkkxlrrdstkmfbose`) is reachable
and exposes nothing. The bot has not been migrated onto it. See
`db/RM_SERVER_SETUP.md` — the schema is dry-run tested, including the two
migrations that fail on a fresh project.

**Three read-only views exposed to `anon`**, once it is populated:

| View over | Lights up |
|---|---|
| `bot_equity_snapshots` | public equity curve (P2-401) |
| `bot_trades` | closed-trade history (P2-404, P2-504) |
| `bot_v_open_positions` | live positions (P2-503) |

Views, not table access — it lets you choose which columns leave the project.
**Please withhold lot size and balance.** Lot size beside a result reveals the
master's account size, and from that every investor's allocation.

---

## 4. Things Esther can do without anyone

**Done 6 Oct:** email provider enabled, confirm-email turned off for testing,
and admin access handled by migration — `estherolukorede12@gmail.com` is
promoted automatically the moment that account signs up.

Still outstanding:

1. **Netlify (P2-005).** Create the site, connect the repo, set env vars, point
   `highzcore.com` at it. `netlify.toml` is committed and ready.
2. **Turn Confirm email back ON before launch.** It is off so the flow can be
   tested without the email rate limit. P2-106 requires verification, and it is
   what stops someone registering an address they do not control.
3. **Screenshots for P2-201**, once the master account exists.

---

## What is NOT blocked

Everything else. E1, E2, E4, E5, E6 are complete; E3 is 8 of 13 with the
remaining five listed above. The app builds, 17 unit tests and 36 database
checks pass, and the schema is live on rm-web and verified against the API.
