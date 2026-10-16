import { createServiceClient } from "@/lib/supabase/service";
import { createRmServerClient } from "@/lib/supabase/rm-server";
import { summarise, type BillingSummary } from "@/lib/billing-summary";
import { liquidityFrom, type Liquidity } from "@/lib/admin/liquidity";
import { entitlementFrom } from "@/lib/entitlement";
import { progressOf, type Granularity, type ProgressPoint } from "@/lib/admin/progress";
import { totalsFor, type HistoryTotals } from "@/lib/admin/history";
import type { Investor, Subscription } from "@/lib/supabase/types";
import type { BotEquity, BotMarket, BotTrade } from "@/lib/workspace/types";

/**
 * Everything the admin overview shows, read once.
 *
 * TWO SEPARATE BOOKS, and the type keeps them apart. `bot` is the master
 * trading account — money that belongs to the investors mirroring it. `business`
 * is ours — subscriptions we charged. They must never be added together, and
 * the surest way to stop that happening is to make it awkward: there is no
 * field anywhere here that holds both, and no helper that could produce one.
 * See lib/admin/trading-pnl.ts, which says the same thing from the other side.
 *
 * Every figure is nullable where it is genuinely unknown. An unconfigured
 * rm-server gives `bot.connected === false`, not zeroes — "the bot has made
 * $0.00" and "we cannot see the bot" look identical on screen otherwise, and
 * only one of them is a reason to go and look at the VM.
 */

export type BotOverviewFigures = {
  connected: boolean;
  /** Broker balance: settled cash, excluding anything floating. */
  balance: number | null;
  /** Balance plus the P&L of everything currently open. */
  equity: number | null;
  /** equity − balance. What the open positions are worth right now. */
  floating: number | null;
  marginFree: number | null;
  /** Positions the broker holds open. */
  openPositions: number;
  /** Floating P&L summed from the live market rows, for the navbar bell. */
  openPnl: number;
  /** Closed-trade result, net of commission and swap, all time. */
  closed: HistoryTotals;
  /** Same, for the current calendar day (UTC). */
  today: HistoryTotals;
  markets: { total: number; enabled: number; trading: number };
  /**
   * The progress series behind the chart — ALL THREE granularities.
   *
   * Computed together from one read rather than one per request. Two reasons,
   * and the second is the important one: the day/week/month toggle is then
   * instant with no refetch, and the three CANNOT disagree, because they are
   * the same trades bucketed three ways in the same call. Fetching per
   * granularity would let a trade close between two clicks and make the month
   * stop being the sum of its weeks.
   */
  progress: Record<Granularity, ProgressPoint[]>;
  /** The newest equity snapshot's timestamp — what the staleness badge reads. */
  lastSnapshotAt: string | null;
  /** The newest write of any kind from the bot. */
  lastSeenAt: string | null;
  /** Global trading switch, null when bot_settings is unreadable. */
  tradingEnabled: boolean | null;
};

export type RevenueByAudience = {
  /** account_type = 'trader'. Buys the analysis; no broker account. */
  traders: { people: number; subscribed: number; revenueUsd: number; mrrUsd: number };
  /** account_type = 'investor'. The bot trades their own Vantage account. */
  investors: { people: number; subscribed: number; revenueUsd: number; mrrUsd: number };
  /**
   * Holders of at least one live API key.
   *
   * NO REVENUE FIGURE, deliberately. There is no developer plan: API access
   * comes with a subscription and is not billed separately, so any number here
   * would either double-count a trader's $20 or invent a price we do not
   * charge. The count is real and the revenue is honestly absent — see
   * `developersBilled` for the flag the UI uses to say so.
   */
  developers: { people: number; activeKeys: number };
  /** False while API access is not a priced product. */
  developersBilled: boolean;
};

export type BusinessFigures = {
  /** Customers, excluding admins and soft-deleted rows. */
  users: number;
  /** Customers whose entitlement has not run out. */
  subscribed: number;
  newThisMonth: number;
  summary: BillingSummary;
  liquidity: Liquidity;
  revenue: RevenueByAudience;
};

export type AdminOverview = {
  bot: BotOverviewFigures;
  business: BusinessFigures;
};

const NOT_CONNECTED: BotOverviewFigures = {
  connected: false,
  balance: null,
  equity: null,
  floating: null,
  marginFree: null,
  openPositions: 0,
  openPnl: 0,
  closed: { net: 0, trades: 0, wins: 0, losses: 0, profitFactor: null },
  today: { net: 0, trades: 0, wins: 0, losses: 0, profitFactor: null },
  markets: { total: 0, enabled: 0, trading: 0 },
  progress: { day: [], week: [], month: [] },
  lastSnapshotAt: null,
  lastSeenAt: null,
  tradingEnabled: null,
};

/** Midnight UTC today, as an ISO string. */
function startOfTodayIso(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

/** The bot's half. */
export async function getBotFigures(): Promise<BotOverviewFigures> {
  const client = createRmServerClient();
  if (!client) return NOT_CONNECTED;

  // Settled rather than awaited in sequence: rm-server is not ours and a table
  // we cannot read must not take the whole page down. Each read falls back to
  // its own empty value and the page says which part is missing.
  const [snapshot, markets, configs, closedAll, settings] = await Promise.all([
    client
      .from("bot_equity_snapshots")
      .select("*")
      .order("ts", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((r) => (r.data ?? null) as BotEquity | null, () => null),
    client
      .from("bot_market_state")
      .select("symbol, alias, state, pnl, volume, updated_at, opened_at")
      .then((r) => (r.data ?? []) as BotMarket[], () => [] as BotMarket[]),
    client
      .from("bot_symbol_config")
      .select("symbol, enabled")
      .then(
        (r) => (r.data ?? []) as { symbol: string; enabled: boolean }[],
        () => [] as { symbol: string; enabled: boolean }[],
      ),
    // Every closed trade, for the all-time figures and the chart. Columns
    // listed rather than `*` — this is the widest read on the page and the
    // snapshots are large JSON the overview never looks at.
    client
      .from("bot_trades")
      .select("symbol, side, volume, open_ts, close_ts, pnl, commission, swap")
      .not("close_ts", "is", null)
      .order("close_ts", { ascending: false })
      .limit(20_000)
      .then((r) => (r.data ?? []) as BotTrade[], () => [] as BotTrade[]),
    client
      .from("bot_settings")
      .select("trading_enabled, updated_at, seen_by_bot_at")
      .maybeSingle()
      .then((r) => r.data as { trading_enabled: boolean } | null, () => null),
  ]);

  const since = startOfTodayIso();
  const today = closedAll.filter((t) => (t.close_ts ?? "") >= since);

  // Floating P&L from the live market rows rather than from equity − balance:
  // the two should agree, but the market rows also say WHICH markets are open,
  // which is what the navbar bell drops down to show.
  const open = markets.filter((m) => m.state === "active");
  const openPnl = open.reduce((sum, m) => sum + (m.pnl ?? 0), 0);

  const balance = snapshot?.balance ?? null;
  const equity = snapshot?.equity ?? null;

  const lastMarketWrite =
    markets
      .map((m) => m.updated_at)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

  return {
    connected: true,
    balance,
    equity,
    floating:
      balance !== null && equity !== null ? equity - balance : null,
    marginFree: snapshot?.margin_free ?? null,
    // The snapshot's own count is the broker's; the market rows are the bot's
    // view. The broker's wins when both exist.
    openPositions: snapshot?.open_positions ?? open.length,
    openPnl,
    closed: totalsFor(closedAll),
    today: totalsFor(today),
    markets: {
      total: configs.length || markets.length,
      enabled: configs.filter((c) => c.enabled).length,
      trading: open.length,
    },
    progress: {
      day: progressOf(closedAll, "day"),
      week: progressOf(closedAll, "week"),
      month: progressOf(closedAll, "month"),
    },
    lastSnapshotAt: snapshot?.ts ?? null,
    // The newest write of ANY kind. A market row ticks every cycle while a
    // snapshot is slower, so reading only the snapshot makes a healthy bot
    // look stale.
    lastSeenAt:
      [lastMarketWrite, snapshot?.ts ?? null]
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
    tradingEnabled: settings?.trading_enabled ?? null,
  };
}

/** Which markets are open right now, for the navbar bell. */
export type LivePosition = {
  symbol: string;
  alias: string;
  pnl: number | null;
  volume: number | null;
  openedAt: string | null;
};

export async function getLivePositions(): Promise<LivePosition[]> {
  const client = createRmServerClient();
  if (!client) return [];

  const { data } = await client
    .from("bot_market_state")
    .select("symbol, alias, state, pnl, volume, opened_at")
    .eq("state", "active");

  return ((data ?? []) as BotMarket[]).map((m) => ({
    symbol: m.symbol,
    alias: m.alias || m.symbol,
    pnl: m.pnl,
    volume: m.volume,
    openedAt: m.opened_at,
  }));
}

/**
 * The company's half.
 *
 * Admins come out of every count. An admin may also hold a customer account,
 * and counting them inflates the headcount read as "the book" — which is how a
 * colleague ends up chased for a renewal. Same rule as the old overview and
 * lib/admin/users.ts; one definition, applied here once.
 */
export async function getBusinessFigures(): Promise<BusinessFigures> {
  const service = createServiceClient();

  const [investorsResult, subsResult, adminsResult, keysResult] =
    await Promise.all([
      service
        .from("investors")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      service.from("subscriptions").select("*"),
      service.from("app_admins").select("user_id"),
      // Live keys only. A revoked key is not a developer still building on us.
      service
        .from("api_keys")
        .select("investor_id, revoked_at")
        .is("revoked_at", null),
    ]);

  const investors = (investorsResult.data ?? []) as Investor[];
  const subscriptions = (subsResult.data ?? []) as Subscription[];
  const adminIds = new Set(
    (adminsResult.data ?? []).map((r) => r.user_id as string),
  );

  const customers = investors.filter((i) => !adminIds.has(i.user_id));
  const customerIds = new Set(customers.map((c) => c.id));

  // Subscriptions belonging to customers only, so revenue and headcount are
  // filtered the same way. Mixing the two is how a staff test payment shows up
  // in a revenue figure.
  const customerSubs = subscriptions.filter((s) => customerIds.has(s.investor_id));
  const summary = summarise(customerSubs);
  const liquidity = liquidityFrom(customerSubs);

  const byInvestor = new Map<string, Subscription[]>();
  for (const sub of customerSubs) {
    const list = byInvestor.get(sub.investor_id) ?? [];
    list.push(sub);
    byInvestor.set(sub.investor_id, list);
  }

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  // Revenue by audience. Split on account_type, which is the product somebody
  // bought — 'trader' buys the analysis, 'investor' has the bot trade their own
  // account. Both pay the same $20, so without this split the page can say what
  // we earn but not what we earn it FROM.
  const audience = {
    trader: { people: 0, subscribed: 0, revenueUsd: 0, mrrUsd: 0 },
    investor: { people: 0, subscribed: 0, revenueUsd: 0, mrrUsd: 0 },
  };

  let subscribed = 0;
  let newThisMonth = 0;

  for (const customer of customers) {
    const kind = customer.account_type === "trader" ? "trader" : "investor";
    const bucket = audience[kind];
    bucket.people += 1;

    if (new Date(customer.created_at) >= monthStart) newThisMonth += 1;

    const subs = byInvestor.get(customer.id) ?? [];
    const entitlement = entitlementFrom(subs);
    if (entitlement.active) {
      bucket.subscribed += 1;
      subscribed += 1;

      // Same MRR definition as billing-summary: the most recent confirmed term
      // divided by its length. Repeated rather than imported because that one
      // works on a flat list and this needs it per audience — the figures are
      // checked against each other in the test.
      const latest = subs
        .filter((s) => s.status === "confirmed" && s.starts_at)
        .sort((a, b) => ((a.starts_at ?? "") < (b.starts_at ?? "") ? 1 : -1))[0];
      if (latest && latest.months > 0) {
        bucket.mrrUsd += Math.round(latest.amount_usd / latest.months);
      }
    }

    // All-time confirmed revenue, net of refunds — the same netting
    // billing-summary applies, so the two agree when added up.
    for (const sub of subs) {
      if (sub.status !== "confirmed") continue;
      bucket.revenueUsd += sub.amount_usd - (sub.refunded_usd ?? 0);
    }
  }

  const keys = (keysResult.data ?? []) as { investor_id: string }[];
  const developerIds = new Set(
    keys.map((k) => k.investor_id).filter((id) => customerIds.has(id)),
  );

  return {
    users: customers.length,
    subscribed,
    newThisMonth,
    summary,
    liquidity,
    revenue: {
      traders: audience.trader,
      investors: audience.investor,
      developers: {
        people: developerIds.size,
        activeKeys: keys.filter((k) => customerIds.has(k.investor_id)).length,
      },
      developersBilled: false,
    },
  };
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const [bot, business] = await Promise.all([
    getBotFigures(),
    getBusinessFigures(),
  ]);
  return { bot, business };
}
