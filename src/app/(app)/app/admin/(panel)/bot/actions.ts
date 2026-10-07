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

  const { error } = await client
    .from("bot_symbol_config")
    .update({
      lot_size: lotSize,
      updated_at: new Date().toISOString(),
      // Granted, and write-only for us (migration 019). Set because "who
      // changed this lot size" is the question the column exists to answer.
      updated_by: admin.email,
    })
    .eq("symbol", symbol);

  if (error) {
    console.error("[admin/bot] lot size write failed:", error.message);
    return { ok: false, error: "generic" };
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

  const { error } = await client
    .from("bot_symbol_config")
    .update({
      close_at_profit: closeAtProfit,
      updated_at: new Date().toISOString(),
      updated_by: admin.email,
    })
    .eq("symbol", symbol);

  if (error) {
    console.error("[admin/bot] close-at-profit write failed:", error.message);
    return { ok: false, error: "generic" };
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

  const { error } = await client
    .from("bot_symbol_config")
    .update({
      enabled,
      updated_at: new Date().toISOString(),
      updated_by: admin.email,
    })
    .eq("symbol", symbol);

  if (error) {
    console.error("[admin/bot] market toggle failed:", error.message);
    return { ok: false, error: "generic" };
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

  const { error } = await client
    .from("bot_settings")
    .update({
      trading_enabled: enabled,
      updated_at: new Date().toISOString(),
      updated_by: admin.email,
    })
    // bot_settings is a single row; the bot's own queries assume id = 1.
    .eq("id", 1);

  if (error) {
    console.error("[admin/bot] trading switch failed:", error.message);
    return { ok: false, error: "generic" };
  }

  await recordAdminAction(
    enabled ? "bot.trading_enabled" : "bot.trading_disabled",
    { type: "bot" },
  );

  revalidatePath("/app/admin/bot");
  return { ok: true };
}
