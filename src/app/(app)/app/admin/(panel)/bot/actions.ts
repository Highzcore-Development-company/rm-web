"use server";

import { revalidatePath } from "next/cache";
import { recordAdminAction, requirePermission } from "@/lib/admin";
import {
  endBotSession,
  getBotWriteClient,
  startBotSession,
} from "@/lib/supabase/rm-server-session";

export type BotActionResult = { ok: true } | { ok: false; error: string };

/**
 * A8 — the controls an investor must never get.
 *
 * Each writes exactly the columns the bot granted `authenticated` and nothing
 * else, signed in as THE ADMIN on rm-server — the anon key would affect zero
 * rows and report success. Lot size is NOT validated against broker min/max/step here on purpose:
 * the bot does that against the live instrument and snaps a bad value within
 * about a minute. Duplicating it would mean two sources of truth for a limit
 * that changes per symbol and per broker, and ours would be the stale one.
 *
 * What IS rejected here is nonsense: negative, zero, or not a number. Those
 * are not "the broker disagrees", they are a typo, and sending them would make
 * the bot correct something it should never have received.
 */

async function writeClient() {
  return getBotWriteClient();
}

/**
 * A write that changed nothing is a FAILED write, not a successful one.
 *
 * This caught a real bug and it had been live for days: bot_settings never had
 * an UPDATE policy (the columns were granted in 013/014, a read policy arrived
 * in 018, an update policy was never written). Under RLS a grant without a
 * policy is refused — but PostgREST returns no error for an UPDATE that simply
 * matches no rows. So the trading switch reported success every time and
 * changed nothing, which is the worst possible failure for a kill switch.
 *
 * Every rm-server write therefore asks for the rows it changed and treats an
 * empty result as a refusal. The alternative is trusting that an absent error
 * means something happened, which is exactly what went wrong.
 */
function refused(what: string, message?: string): BotActionResult {
  console.error(
    `[admin/bot] ${what} affected no rows${message ? `: ${message}` : ""} — ` +
      "check the rm-server policy and that this admin is in bot_admins",
  );
  return { ok: false, error: "refused" };
}

/**
 * Connect this admin to rm-server.
 *
 * Their own rm-server credentials, never stored — only the resulting refresh
 * token, in an httpOnly cookie for this browser session.
 */
export async function connectToBot(
  email: string,
  password: string,
): Promise<BotActionResult> {
  const admin = await requirePermission("bot.configure");
  if (!admin) return { ok: false, error: "forbidden" };

  const result = await startBotSession(email, password);
  if (!result.ok) return { ok: false, error: result.error };

  // Recorded because it is the moment an admin gained the ability to stop
  // trading for everybody. The rm-server identity is noted alongside ours:
  // the two are different accounts and may well be different emails.
  await recordAdminAction("bot.connected", { type: "bot" }, {
    rm_server_email: result.email,
  });

  revalidatePath("/app/admin/bot");
  return { ok: true };
}

export async function disconnectFromBot(): Promise<BotActionResult> {
  const admin = await requirePermission("bot.configure");
  if (!admin) return { ok: false, error: "forbidden" };

  await endBotSession();
  await recordAdminAction("bot.disconnected", { type: "bot" });

  revalidatePath("/app/admin/bot");
  return { ok: true };
}

export async function setLotSize(
  symbol: string,
  lotSize: number,
): Promise<BotActionResult> {
  const admin = await requirePermission("bot.configure");
  if (!admin) return { ok: false, error: "forbidden" };

  if (!Number.isFinite(lotSize) || lotSize <= 0) {
    return { ok: false, error: "bad_lot" };
  }

  const client = await writeClient();
  if (!client) return { ok: false, error: "not_connected" };

  const { data, error } = await client
    .from("bot_symbol_config")
    .update({
      lot_size: lotSize,
      updated_at: new Date().toISOString(),
      // Granted, and write-only for us (migration 019). Set because "who
      // changed this lot size" is the question the column exists to answer.
      updated_by: admin.email,
    })
    .eq("symbol", symbol)
    .select("symbol");

  if (error || !data?.length) {
    return refused("lot size", error?.message);
  }

  // The operator account did it on rm-server; this records which ADMIN asked.
  await recordAdminAction("bot.lot_size_changed", { type: "market", id: symbol }, {
    lot_size: lotSize,
  });

  revalidatePath("/app/admin/bot");
  return { ok: true };
}

export async function setCloseAtProfit(
  symbol: string,
  closeAtProfit: number | null,
): Promise<BotActionResult> {
  const admin = await requirePermission("bot.configure");
  if (!admin) return { ok: false, error: "forbidden" };

  if (closeAtProfit !== null && (!Number.isFinite(closeAtProfit) || closeAtProfit <= 0)) {
    return { ok: false, error: "bad_profit" };
  }

  const client = await writeClient();
  if (!client) return { ok: false, error: "not_connected" };

  const { data, error } = await client
    .from("bot_symbol_config")
    .update({
      close_at_profit: closeAtProfit,
      updated_at: new Date().toISOString(),
      updated_by: admin.email,
    })
    .eq("symbol", symbol)
    .select("symbol");

  if (error || !data?.length) {
    return refused("close-at-profit", error?.message);
  }

  await recordAdminAction("bot.close_at_profit_changed", {
    type: "market",
    id: symbol,
  }, { close_at_profit: closeAtProfit });

  revalidatePath("/app/admin/bot");
  return { ok: true };
}

export async function setMarketEnabled(
  symbol: string,
  enabled: boolean,
): Promise<BotActionResult> {
  const admin = await requirePermission("bot.configure");
  if (!admin) return { ok: false, error: "forbidden" };

  const client = await writeClient();
  if (!client) return { ok: false, error: "not_connected" };

  const { data, error } = await client
    .from("bot_symbol_config")
    .update({
      enabled,
      updated_at: new Date().toISOString(),
      updated_by: admin.email,
    })
    .eq("symbol", symbol)
    .select("symbol");

  if (error || !data?.length) {
    return refused("market switch", error?.message);
  }

  await recordAdminAction("bot.market_toggled", { type: "market", id: symbol }, {
    enabled,
  });

  revalidatePath("/app/admin/bot");
  return { ok: true };
}

/** The global trading switch. */
export async function setTradingEnabled(
  enabled: boolean,
): Promise<BotActionResult> {
  const admin = await requirePermission("bot.configure");
  if (!admin) return { ok: false, error: "forbidden" };

  const client = await writeClient();
  if (!client) return { ok: false, error: "not_connected" };

  const { data, error } = await client
    .from("bot_settings")
    .update({
      trading_enabled: enabled,
      updated_at: new Date().toISOString(),
      updated_by: admin.email,
    })
    // bot_settings is a single row; the bot's own queries assume id = 1.
    .eq("id", 1)
    .select("id");

  if (error || !data?.length) {
    return refused("trading switch", error?.message);
  }

  await recordAdminAction(
    enabled ? "bot.trading_enabled" : "bot.trading_disabled",
    { type: "bot" },
  );

  revalidatePath("/app/admin/bot");
  return { ok: true };
}

/**
 * Ask-before-trading.
 *
 * With this on, the bot does not place its own orders: it writes a PROPOSAL
 * and waits. Nothing goes live until somebody answers it.
 */
export async function setRequireApproval(
  required: boolean,
): Promise<BotActionResult> {
  const admin = await requirePermission("bot.configure");
  if (!admin) return { ok: false, error: "forbidden" };

  const client = await writeClient();
  if (!client) return { ok: false, error: "not_connected" };

  const { data, error } = await client
    .from("bot_settings")
    .update({
      require_approval: required,
      updated_at: new Date().toISOString(),
      updated_by: admin.email,
    })
    .eq("id", 1);

  if (error) {
    console.error("[admin/bot] approval mode failed:", error.message);
    return { ok: false, error: "generic" };
  }

  await recordAdminAction(
    required ? "bot.approval_required" : "bot.approval_not_required",
    { type: "bot" },
  );

  revalidatePath("/app/admin/bot");
  return { ok: true };
}

/**
 * Answer a pending proposal.
 *
 * WHERE THE LINE IS. This does not place a trade, and must not be read as
 * doing so. The bot wrote the proposal — the symbol, the level, the stop and
 * the target are all its analysis — and the bot's trading loop is what places
 * it afterwards, or does not, if price has already moved past the level. An
 * admin is answering yes or no to the bot's question, never composing an
 * order. The spec's rule holds: an admin configures the bot, the bot trades.
 *
 * Rejection takes a reason because a rejected proposal with no note is
 * unreadable a week later, when the question is whether the strategy was
 * wrong or the operator was nervous.
 */
export async function decideProposal(
  id: string,
  approved: boolean,
  note?: string,
): Promise<BotActionResult> {
  const admin = await requirePermission("bot.configure");
  if (!admin) return { ok: false, error: "forbidden" };

  if (!approved && !note?.trim()) return { ok: false, error: "no_reason" };

  const client = await writeClient();
  if (!client) return { ok: false, error: "not_connected" };

  const { data, error } = await client
    .from("bot_proposals")
    .update({
      status: approved ? "approved" : "rejected",
      decided_by: admin.email,
      decided_at: new Date().toISOString(),
      note: note?.trim() || null,
    })
    .eq("id", id)
    // ONLY while it is still pending. Without this, answering a proposal the
    // bot has already placed or expired would overwrite the outcome — and two
    // admins opening the queue at once would both think they decided it.
    .eq("status", "pending")
    .select("id");

  if (error) {
    console.error("[admin/bot] proposal decision failed:", error.message);
    return { ok: false, error: "generic" };
  }

  // No rows changed means it stopped being pending between the page rendering
  // and the click. Said plainly rather than reporting a success that did
  // nothing.
  if (!data || data.length === 0) return { ok: false, error: "already_decided" };

  await recordAdminAction(
    approved ? "bot.proposal_approved" : "bot.proposal_rejected",
    { type: "proposal", id },
    note?.trim() ? { note: note.trim() } : undefined,
  );

  revalidatePath("/app/admin/bot");
  return { ok: true };
}

export type CommandResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Ask the bot to close a live trade.
 *
 * THE INSERT SUCCEEDING IS NOT THE TRADE CLOSING, and that distinction is the
 * whole reason bot_commands exists. We write a row; the bot picks it up on its
 * next loop, tries it against the broker, and writes back status done|failed
 * with a note. A "closed" toast on a trade that is still open is the one
 * failure this table was built to prevent — so this returns the row id and the
 * caller watches it, rather than reporting success here.
 *
 * Writes only the columns migration 020 grants: command, symbol, ticket,
 * payload, created_by. status, note and processed_at are the BOT's to write
 * and are deliberately not touched — if we set status ourselves we would be
 * answering our own question.
 */
export async function requestCloseTrade(
  symbol: string,
  ticket: number,
): Promise<CommandResult> {
  const admin = await requirePermission("bot.configure");
  if (!admin) return { ok: false, error: "forbidden" };

  if (!Number.isInteger(ticket) || ticket <= 0) {
    return { ok: false, error: "bad_ticket" };
  }

  const client = await writeClient();
  if (!client) return { ok: false, error: "not_connected" };

  const { data, error } = await client
    .from("bot_commands")
    .insert({
      command: "close",
      symbol,
      ticket,
      payload: {},
      // The ADMIN's email, not the rm-server account's. They may differ, and
      // "who asked for this position to be closed" has to name a person.
      created_by: admin.email,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error("[admin/bot] close command failed:", error?.message);
    return { ok: false, error: "generic" };
  }

  await recordAdminAction("bot.close_requested", { type: "trade", id: String(ticket) }, {
    symbol,
  });

  return { ok: true, id: data.id as string };
}

export type CommandState = {
  status: string;
  note: string | null;
  processedAt: string | null;
};

/** Where a close request got to. Polled by the UI until it leaves `pending`. */
export async function readCommand(id: string): Promise<CommandState | null> {
  const admin = await requirePermission("bot.view");
  if (!admin) return null;

  const client = await writeClient();
  if (!client) return null;

  const { data } = await client
    .from("bot_commands")
    .select("status, note, processed_at")
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;
  return {
    status: (data.status as string) ?? "pending",
    note: (data.note as string | null) ?? null,
    processedAt: (data.processed_at as string | null) ?? null,
  };
}
