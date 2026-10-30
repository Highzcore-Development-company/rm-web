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
  const [markets, configs, specs, closed, equity, settings, resumeAt] = await Promise.all([
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
    /**
     * resume_at ON ITS OWN, and allowed to fail.
     *
     * It arrives with the bot's migration 024, which this repo cannot
     * guarantee has run — and PostgREST refuses the WHOLE select on one
     * unknown column. Folding it into the query above cost us exactly that:
     * the settings row came back null, the card read `?? false`, and the
     * dashboard told everyone the bot was STOPPED while it was trading.
     *
     * A scheduling nicety must never be able to take the state of the kill
     * switch down with it, so it is a separate request whose failure means
     * only "no resume scheduled".
     *
     * resume_by is deliberately not read. It holds an admin's email, same as
     * updated_by, and this payload reaches the investor desk.
     */
    // .then with both handlers rather than .catch: the builder returns a
    // PromiseLike, which has no .catch. A rejection here must still resolve
    // to "no resume scheduled" rather than taking Promise.all down.
    client
      .from("bot_settings")
      .select("resume_at")
      .maybeSingle()
      .then(
        (r) => (r.data as { resume_at?: string | null } | null)?.resume_at ?? null,
        () => null,
      ),
  ]).catch(() => [[], [], [], [], [], null, null] as const);

  const curve = (equity as BotEquity[]).slice().reverse();

  return {
    markets: markets as BotMarket[],
    configs: configs as BotConfig[],
    specs: specs as BotSymbolSpec[],
    closedTrades: closed as BotTrade[],
    equity: curve.at(-1) ?? null,
    equityCurve: curve,
    // Merged here rather than selected together — see the note on the
    // resume_at query above for why it is fetched separately.
    settings: settings
      ? ({ ...settings, resume_at: resumeAt } as unknown as BotSettings)
      : null,
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

/**
 * Just what the Bot controls page needs.
 *
 * WHY THIS IS NOT getWorkspaceData(). Esther: "it still takes time before it
 * changes." Saving a lot size calls revalidatePath, which re-runs the page,
 * which was re-running the full workspace read: market state with every
 * indicator snapshot, 200 closed trades and 500 equity points — measured at
 * ~800ms against the live database. The Bot page reads none of the trades and
 * none of the equity. It was paying for 365 rows it never looks at, on every
 * save, and that was most of the wait.
 *
 * THE COLUMNS ARE NAMED for the same reason they are named in the full read:
 * rm-server grants the anon key specific columns and withholds `updated_by`,
 * so `select *` is refused outright rather than quietly trimmed. The market
 * read is narrower still — this page wants a PRICE per symbol to compute the
 * pip line under each lot box, not the indicator snapshot.
 *
 * Returns the same shapes the page already consumes, so it is a swap rather
 * than a rewrite of the page.
 */
export async function getBotControlsData(): Promise<{
  configs: BotConfig[];
  /** symbol/alias/price only — enough for the pip line. */
  markets: Pick<BotMarket, "symbol" | "alias" | "price">[];
  settings: BotSettings | null;
  connected: boolean;
}> {
  const client = createRmServerClient();
  if (!client) {
    return { configs: [], markets: [], settings: null, connected: false };
  }

  const [configs, markets, settings, resumeAt] = await Promise.all([
    client
      .from("bot_symbol_config")
      .select("symbol, alias, lot_size, close_at_profit, enabled, updated_at")
      .then((r) => r.data ?? []),
    client
      .from("bot_market_state")
      .select("symbol, alias, price")
      .then((r) => r.data ?? []),
    client
      .from("bot_settings")
      .select("id, trading_enabled, require_approval, cutover_at, seen_by_bot_at, updated_at")
      .maybeSingle()
      .then((r) => r.data ?? null),
    // Separate and allowed to fail — see the note on the same read above.
    client
      .from("bot_settings")
      .select("resume_at")
      .maybeSingle()
      .then(
        (r) => (r.data as { resume_at?: string | null } | null)?.resume_at ?? null,
        () => null,
      ),
  ]).catch(() => [[], [], null, null] as const);

  return {
    configs: configs as BotConfig[],
    markets: markets as Pick<BotMarket, "symbol" | "alias" | "price">[],
    settings: settings
      ? ({ ...settings, resume_at: resumeAt } as unknown as BotSettings)
      : null,
    connected: true,
  };
}
