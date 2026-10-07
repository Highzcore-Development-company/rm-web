import "server-only";
import { createRmServerClient } from "@/lib/supabase/rm-server";
import type {
  BotConfig,
  BotEquity,
  BotMarket,
  BotProposal,
  BotSettings,
  BotSymbolSpec,
  BotTrade,
} from "@/lib/workspace/types";

/**
 * What the workspace needs, read from rm-server.
 *
 * highzcore's version of this is `getBotOverview()`, which uses a service-role
 * client because that desk is admin-only. This one cannot: the caller is an
 * investor, so it reads with the anon key and gets exactly what rm-server's
 * RLS publishes. If a column should not reach a customer, the answer is a
 * policy in rm-server, not a filter here — a filter is a suggestion, a policy
 * is a rule.
 *
 * rm-server has no migrations yet, so every read below is expected to come
 * back empty today. That is why nothing throws: the workspace renders its own
 * empty states, and an empty desk is a truthful one. The moment the schema
 * lands and the env vars are set, the same function starts returning real rows
 * with no change here.
 */
export type WorkspaceData = {
  markets: BotMarket[];
  configs: BotConfig[];
  specs: BotSymbolSpec[];
  closedTrades: BotTrade[];
  equity: BotEquity | null;
  equityCurve: BotEquity[];
  settings: BotSettings | null;
  proposals: BotProposal[];
  lastUpdate: string | null;
  /** False when rm-server is unconfigured — the header says so rather than
   *  letting an empty desk read as "the bot did nothing". */
  connected: boolean;
};

const EMPTY: WorkspaceData = {
  markets: [],
  configs: [],
  specs: [],
  closedTrades: [],
  equity: null,
  equityCurve: [],
  settings: null,
  proposals: [],
  lastUpdate: null,
  connected: false,
};

export async function getWorkspaceData(): Promise<WorkspaceData> {
  const client = createRmServerClient();
  if (!client) return EMPTY;

  // Settled, not awaited in sequence: one missing table must not take the
  // whole desk down while the schema is still being applied.
  const [markets, configs, specs, closed, equity, settings] = await Promise.all([
    client.from("bot_market_state").select("*").then((r) => r.data ?? []),
    // Columns listed for the same reason as bot_settings below: rm-server
    // withholds `updated_by` (the email of whoever last changed a lot size)
    // from the anon key, and a column-level grant makes `select *` an outright
    // permission error rather than a quietly trimmed row.
    client
      .from("bot_symbol_config")
      .select("symbol, alias, lot_size, close_at_profit, enabled, updated_at")
      .then((r) => r.data ?? []),
    client.from("bot_symbols").select("*").then((r) => r.data ?? []),
    client
      .from("bot_trades")
      .select("*")
      .not("close_ts", "is", null)
      .order("close_ts", { ascending: false })
      .limit(200)
      .then((r) => r.data ?? []),
    client
      .from("bot_equity_snapshots")
      .select("*")
      .order("ts", { ascending: false })
      .limit(500)
      .then((r) => r.data ?? []),
    // Columns listed, not `*`. rm-server grants the anon key SELECT on these
    // specific columns and deliberately withholds `updated_by`, which holds
    // the email of whoever last flipped the switch (migration 018). With a
    // column-level grant, `select *` is refused outright rather than silently
    // dropping the column — so asking for everything would break the switch
    // entirely instead of leaking an address.
    client
      .from("bot_settings")
      .select("id, trading_enabled, require_approval, cutover_at, seen_by_bot_at, updated_at")
      .maybeSingle()
      .then((r) => r.data ?? null),
  ]).catch(() => [[], [], [], [], [], null] as const);

  const curve = (equity as BotEquity[]).slice().reverse();

  return {
    markets: markets as BotMarket[],
    configs: configs as BotConfig[],
    specs: specs as BotSymbolSpec[],
    closedTrades: closed as BotTrade[],
    equity: curve.at(-1) ?? null,
    equityCurve: curve,
    settings: settings as BotSettings | null,
    // Approvals are an operator concern; an investor is never asked to decide
    // one, so the list stays empty regardless of what rm-server holds.
    proposals: [],
    lastUpdate:
      (markets as BotMarket[])
        .map((m) => m.updated_at)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
    connected: true,
  };
}
