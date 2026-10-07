import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createRmServerClient } from "@/lib/supabase/rm-server";
import { isAuthorisedJob } from "@/lib/job-auth";
import {
  botSwitchedOffEmail,
  isEmailConfigured,
  sendEmail,
  tradeClosedEmail,
  tradeOpenedEmail,
} from "@/lib/email";
import { entitlementFrom } from "@/lib/entitlement";
import { envOr } from "@/lib/env";
import { instrumentMovePercent } from "@/lib/trade-move";
import type { Subscription } from "@/lib/supabase/types";
import type { BotTrade } from "@/lib/workspace/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * P2-506 — trade and bot-state notifications.
 *
 * The preferences, the switches and the UI shipped months before this did. The
 * switches controlled nothing, which is worse than having none: it tells
 * somebody they have turned off something that was never on.
 *
 * WHO GETS A TRADE EMAIL. The bot trades ONE master account; investors are
 * copied through the MAM and have no trades of their own that we can see. So a
 * trade is an event about the master, and it goes to every investor who is
 * currently entitled, linked and opted in. Not "their" trade — theirs in the
 * sense that their account was copied into it.
 *
 * WHAT IT NEVER SAYS. No lot size, no balance, no cash P&L. Those are the
 * MASTER's numbers and would be wrong for every reader, because each account's
 * size is whatever Vantage allocated it. Direction, market and percentage move
 * are true for everyone.
 *
 * IDEMPOTENCY. Every send is recorded in sent_notifications on
 * (investor, kind, ref) and the INSERT HAPPENS FIRST. A send that then fails
 * is skipped, not retried. The two failure modes are "somebody misses one
 * email" and "everybody gets the same email every five minutes until a human
 * notices"; across 30 markets the second would destroy a young SMTP
 * reputation in an afternoon. We choose to under-send.
 */

/**
 * How far back a first run will look.
 *
 * Without this, pointing the job at an established bot would email everybody
 * about every trade in history on its first tick. A notification is only worth
 * sending while it is news.
 */
const LOOKBACK_MS = 60 * 60 * 1000;

/**
 * Hard cap on sends per run.
 *
 * A backlog, a clock change or a bot restart that re-emits trades should cost
 * one noisy run, not an unbounded mailshot. Anything skipped is reported in
 * the response rather than dropped silently — a cap nobody is told about reads
 * as "everything was sent".
 */
const MAX_SENDS_PER_RUN = 200;

type Recipient = {
  investorId: string;
  email: string;
  prefs: {
    trade_opened: boolean;
    trade_closed: boolean;
    bot_switched_off: boolean;
  };
};

export async function POST(request: Request) {
  if (!isAuthorisedJob(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!isEmailConfigured()) {
    return NextResponse.json({ error: "email_not_configured" }, { status: 503 });
  }

  const rmServer = createRmServerClient();
  if (!rmServer) {
    // Not an error: the bot's project simply is not wired up here yet. Says so
    // plainly so a silent run is never mistaken for a quiet bot.
    return NextResponse.json({ skipped: "rm_server_not_configured" });
  }

  const service = createServiceClient();
  const siteUrl = envOr(process.env.NEXT_PUBLIC_SITE_URL, "https://highzcore.com");
  const dashboardUrl = `${siteUrl}/app/dashboard`;
  const since = new Date(Date.now() - LOOKBACK_MS).toISOString();

  // ---- who is entitled to hear about it ----------------------------------

  const [{ data: investorRows }, { data: subRows }, { data: prefRows }] =
    await Promise.all([
      service
        .from("investors")
        .select("id, user_id, status, disabled_at, deleted_at")
        // Only accounts actually being copied. A pending or suspended investor
        // is not in the MAM, so a trade email would be describing something
        // that did not happen to them.
        .in("status", ["linked", "active"]),
      service.from("subscriptions").select("*").eq("status", "confirmed"),
      service.from("notification_preferences").select("*"),
    ]);

  const subscriptions = (subRows ?? []) as Subscription[];
  const byInvestor = new Map<string, Subscription[]>();
  for (const s of subscriptions) {
    byInvestor.set(s.investor_id, [...(byInvestor.get(s.investor_id) ?? []), s]);
  }

  const prefsByInvestor = new Map(
    (prefRows ?? []).map((p) => [p.investor_id as string, p]),
  );

  const recipients: Recipient[] = [];

  for (const investor of investorRows ?? []) {
    if (investor.disabled_at || investor.deleted_at) continue;

    // Paid up, or inside grace. Somebody in their grace period is still being
    // traded, so they still need to know what is happening to their account.
    const e = entitlementFrom(byInvestor.get(investor.id) ?? []);
    if (!e.active && !e.inGrace) continue;

    const account = await service.auth.admin.getUserById(investor.user_id);
    const email = account.data?.user?.email;
    if (!email) continue;

    // Default ON, matching the table's defaults: somebody with no preferences
    // row has never opted out of anything.
    const p = prefsByInvestor.get(investor.id);
    recipients.push({
      investorId: investor.id,
      email,
      prefs: {
        trade_opened: p?.trade_opened ?? true,
        trade_closed: p?.trade_closed ?? true,
        bot_switched_off: p?.bot_switched_off ?? true,
      },
    });
  }

  if (recipients.length === 0) {
    return NextResponse.json({ sent: 0, reason: "no_recipients" });
  }

  // ---- what happened ------------------------------------------------------

  const [opened, closed, settings] = await Promise.all([
    rmServer
      .from("bot_trades")
      .select("id, symbol, side, open_ts, open_price, close_ts")
      .gte("open_ts", since)
      .is("close_ts", null)
      .then((r) => (r.data ?? []) as BotTrade[]),
    rmServer
      .from("bot_trades")
      .select("id, symbol, side, open_price, close_price, close_ts")
      .gte("close_ts", since)
      .not("close_ts", "is", null)
      .then((r) => (r.data ?? []) as BotTrade[]),
    rmServer
      .from("bot_settings")
      .select("trading_enabled, updated_at")
      .maybeSingle()
      .then((r) => r.data),
  ]);

  let sent = 0;
  let capped = 0;

  /**
   * Record first, then send.
   *
   * The insert is the lock. If it conflicts, this exact notification has
   * already gone to this exact person and we stop. If the send then throws,
   * the row stays and the email is not retried — see the note at the top.
   */
  async function notifyAll(
    kind: "trade_opened" | "trade_closed" | "bot_switched_off",
    ref: string,
    build: () => { subject: string; text: string; html: string },
  ) {
    for (const r of recipients) {
      if (!r.prefs[kind]) continue;

      if (sent >= MAX_SENDS_PER_RUN) {
        capped += 1;
        continue;
      }

      const { error } = await service
        .from("sent_notifications")
        .insert({ investor_id: r.investorId, kind, ref });

      // Conflict on the primary key: already sent. Any other error means we
      // cannot prove it has not been sent, so we do not send.
      if (error) continue;

      const message = build();
      try {
        await sendEmail({ to: r.email, ...message });
        sent += 1;
      } catch (err) {
        console.error(`[notifications] ${kind} to ${r.email} failed:`, err);
      }
    }
  }

  for (const trade of opened) {
    await notifyAll("trade_opened", trade.id, () =>
      tradeOpenedEmail({
        symbol: trade.symbol,
        side: trade.side,
        openedAt: new Date(trade.open_ts),
        dashboardUrl,
      }),
    );
  }

  for (const trade of closed) {
    const movePercent = instrumentMovePercent(
      trade.side,
      trade.open_price,
      trade.close_price,
    );

    await notifyAll("trade_closed", trade.id, () =>
      tradeClosedEmail({
        symbol: trade.symbol,
        side: trade.side,
        movePercent,
        closedAt: new Date(trade.close_ts ?? Date.now()),
        dashboardUrl,
      }),
    );
  }

  // The bot stopping is keyed on WHEN it changed, so each stop notifies once
  // and a later stop notifies again. Keying on "off" alone would send one
  // email ever; keying on the run would send one every tick while it stayed
  // off.
  if (settings && settings.trading_enabled === false && settings.updated_at) {
    const stoppedAt = new Date(settings.updated_at);
    if (Date.now() - stoppedAt.getTime() <= LOOKBACK_MS) {
      await notifyAll("bot_switched_off", settings.updated_at, () =>
        botSwitchedOffEmail({ stoppedAt, dashboardUrl }),
      );
    }
  }

  return NextResponse.json({
    sent,
    recipients: recipients.length,
    opened: opened.length,
    closed: closed.length,
    // Reported, not swallowed. A cap nobody is told about reads as success.
    ...(capped > 0 ? { skipped_by_cap: capped } : {}),
  });
}
