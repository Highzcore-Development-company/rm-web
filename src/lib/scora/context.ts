import { createRmServerClient } from "@/lib/supabase/rm-server";


/**
 * HS-BOT-v4 §3 — the real numbers.
 *
 * "Scora must answer from our own market data — volatility, trend state, the
 * levels, the spread and commission — not from what the model remembers. A
 * general chatbot that happens to discuss forex is not a product anyone pays
 * for."
 *
 * This is the part that makes Scora a product rather than a wrapper. Everything
 * here comes from the bot's own tables; nothing is inferred and nothing is
 * filled in from general knowledge.
 *
 * THE TEST THE BRIEF GIVES: ask it about a market with the chart open. If the
 * answer could have been written without our data, it is not finished.
 *
 * WHAT IS DELIBERATELY ABSENT: anything the model could invent. If a figure is
 * missing we say it is missing — "Never invent a number. A made-up spread is
 * worse than no answer, because it is acted on."
 */

export type MarketFacts = {
  symbol: string;
  alias: string;
  timeframe: string | null;
  htf: string | null;
  trend: string | null;
  htfTrend: string | null;
  /** The second rung up — H4 when the bot trades M15 (bot migration 020).
   *  Given to Scora because people ask about the 4H constantly, and without
   *  it the honest answer was that the bot had no reading at all. */
  htf2: string | null;
  htf2Trend: string | null;
  state: string | null;
  /** The bot's own sentence for why it is in that state. */
  reason: string | null;
  price: number | null;
  level: number | null;
  latestSignal: string | null;
  /** How hard the trend is running, in the bot's own words. */
  trendStrength: string | null;
  /** Average true range: the volatility figure, in price units. */
  atr: number | null;
  /** Trend strength as a number. Below 20 is conventionally "no trend". */
  adx: number | null;
  rsi: number | null;
  ema50: number | null;
  ema200: number | null;
  /** Measured on real fills for this symbol, not a published figure. */
  avgSpread: number | null;
  /** Average commission per lot, in account currency, from closed trades. */
  avgCommissionPerLot: number | null;
  updatedAt: string | null;
};

export type ScoraContext = {
  connected: boolean;
  markets: MarketFacts[];
  /** Null when the bot's switch is unreadable — not the same as "off". */
  tradingEnabled: boolean | null;
  asOf: string | null;
};

/** Exactly the columns read above, which is what the model may be told. */
type ScoraMarketRow = {
  symbol: string;
  alias: string;
  timeframe: string | null;
  htf: string | null;
  entry_trend: string | null;
  htf_trend: string | null;
  htf2: string | null;
  htf2_trend: string | null;
  trend_strength: string | null;
  state: string | null;
  reason: string | null;
  price: number | null;
  level: number | null;
  latest_signal: string | null;
  /** The indicator bundle the bot computed on its last bar. */
  snapshot: {
    atr?: number | null;
    adx?: number | null;
    rsi?: number | null;
    ema50?: number | null;
    ema200?: number | null;
  } | null;
  updated_at: string | null;
};

type CostRow = {
  symbol: string;
  entry_spread: number | null;
  commission: number | null;
  volume: number | null;
};

/**
 * What a symbol has actually cost to trade.
 *
 * Averaged over real fills rather than quoted from a broker page: the figure
 * that matters to somebody deciding whether a market is worth trading is what
 * it cost US, and a published spread is a best case.
 *
 * Commission is stored negative and per trade, so it is turned positive and
 * divided by the lots to give a per-lot figure that can be compared across
 * markets. P2-705 matters here: these are 0.00 on every Deriv trade, so a
 * market with no real cost data must say so rather than claim it is free.
 */
function costsBySymbol(rows: CostRow[]): Map<string, { spread: number | null; commissionPerLot: number | null }> {
  const acc = new Map<string, { s: number; sn: number; c: number; lots: number }>();

  for (const r of rows) {
    const a = acc.get(r.symbol) ?? { s: 0, sn: 0, c: 0, lots: 0 };
    if (r.entry_spread != null && Number.isFinite(r.entry_spread)) {
      a.s += r.entry_spread;
      a.sn += 1;
    }
    if (r.commission != null && r.volume) {
      a.c += Math.abs(r.commission);
      a.lots += r.volume;
    }
    acc.set(r.symbol, a);
  }

  const out = new Map<string, { spread: number | null; commissionPerLot: number | null }>();
  for (const [symbol, a] of acc) {
    out.set(symbol, {
      spread: a.sn > 0 ? a.s / a.sn : null,
      // Zero commission across real lots is a FACT on this broker, not a gap,
      // so it is reported as 0 rather than null.
      commissionPerLot: a.lots > 0 ? a.c / a.lots : null,
    });
  }
  return out;
}

const EMPTY: ScoraContext = {
  connected: false,
  markets: [],
  tradingEnabled: null,
  asOf: null,
};

/**
 * Everything Scora is allowed to state as fact.
 *
 * Read with the ordinary rm-server client. Scora answers questions about the
 * market, which is public to every signed-in user of ours; it never reads an
 * individual's account.
 */
export async function getScoraContext(): Promise<ScoraContext> {
  const client = createRmServerClient();
  if (!client) return EMPTY;

  const [marketRows, settings, costRows] = await Promise.all([
    client
      .from("bot_market_state")
      .select(
        "symbol, alias, timeframe, htf, entry_trend, htf_trend, htf2, htf2_trend, trend_strength, state, reason, price, level, latest_signal, snapshot, updated_at",
      )
      // Only the columns Scora may state as fact. Not `select *`: a narrower
      // query is also a list of what the model is allowed to know.
      .then((r) => (r.data ?? []) as ScoraMarketRow[]),
    client
      .from("bot_settings")
      .select("trading_enabled, updated_at")
      .maybeSingle()
      .then((r) => r.data),
    // Spread and commission are not published anywhere — they are what we were
    // actually charged. Measured from recent closed fills, which is the only
    // honest source for them and the one the brief asks for ("where
    // available").
    client
      .from("bot_trades")
      .select("symbol, entry_spread, commission, volume")
      .not("close_ts", "is", null)
      .order("close_ts", { ascending: false })
      .limit(500)
      .then((r) => (r.data ?? []) as CostRow[]),
  ]);

  if (marketRows.length === 0) return EMPTY;

  const costs = costsBySymbol(costRows);

  const markets: MarketFacts[] = marketRows.map((m) => ({
    symbol: m.symbol,
    alias: m.alias,
    timeframe: m.timeframe,
    htf: m.htf,
    htf2: m.htf2,
    htf2Trend: m.htf2_trend,
    trend: m.entry_trend,
    htfTrend: m.htf_trend,
    state: m.state,
    reason: m.reason,
    price: m.price,
    level: m.level,
    latestSignal: m.latest_signal,
    trendStrength: m.trend_strength,
    atr: m.snapshot?.atr ?? null,
    adx: m.snapshot?.adx ?? null,
    rsi: m.snapshot?.rsi ?? null,
    ema50: m.snapshot?.ema50 ?? null,
    ema200: m.snapshot?.ema200 ?? null,
    avgSpread: costs.get(m.symbol)?.spread ?? null,
    avgCommissionPerLot: costs.get(m.symbol)?.commissionPerLot ?? null,
    updatedAt: m.updated_at,
  }));

  const asOf = markets
    .map((m) => m.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;

  return {
    connected: true,
    markets,
    tradingEnabled: settings
      ? Boolean((settings as { trading_enabled?: boolean }).trading_enabled)
      : null,
    asOf,
  };
}

/**
 * The context, as the model sees it.
 *
 * Deliberately a compact table rather than JSON: it is a third of the tokens
 * for the same facts, and every token here is paid for on every turn.
 *
 * Only markets the question could plausibly be about are included. Sending all
 * thirty on every turn would be most of the prompt, and the model reads the
 * tail of a long list worse than a short one.
 */
export function renderContext(ctx: ScoraContext, question: string): string {
  if (!ctx.connected || ctx.markets.length === 0) {
    // Said explicitly rather than omitted. An absent section invites the model
    // to fill the gap from memory, which is the one thing it must not do.
    return "MARKET DATA: unavailable right now. You do not have current figures, so say so plainly and do not estimate any.";
  }

  const asked = question.toLowerCase().replace(/[^a-z]/g, "");
  const mentioned = ctx.markets.filter((m) => {
    const alias = m.alias.toLowerCase().replace(/[^a-z]/g, "");
    return alias.length >= 4 && asked.includes(alias);
  });

  // Named markets if any, otherwise the ones actually doing something.
  const chosen = mentioned.length
    ? mentioned
    : ctx.markets
        .filter((m) => m.state === "active" || m.state === "ready")
        .slice(0, 8);

  const rows = (chosen.length ? chosen : ctx.markets.slice(0, 8)).map((m) => {
    const bits = [
      `${m.alias} (${m.symbol})`,
      `state=${m.state ?? "unknown"}`,
      m.reason ? `because=${m.reason}` : null,
      m.timeframe && m.trend ? `${m.timeframe}trend=${m.trend}` : null,
      m.htf && m.htfTrend ? `${m.htf}trend=${m.htfTrend}` : null,
      m.htf2 && m.htf2Trend ? `${m.htf2}trend=${m.htf2Trend}` : null,
      m.price != null ? `price=${m.price}` : null,
      m.level != null ? `entry=${m.level}` : null,
      // Volatility, which is what the brief asks for first. ATR in price
      // units; ADX below 20 conventionally means no trend worth trading.
      m.atr != null ? `atr=${m.atr.toPrecision(3)}` : null,
      m.adx != null ? `adx=${m.adx.toFixed(1)}` : null,
      m.rsi != null ? `rsi=${m.rsi.toFixed(1)}` : null,
      m.trendStrength && m.trendStrength !== "None"
        ? `strength=${m.trendStrength}`
        : null,
      m.ema50 != null ? `ema50=${m.ema50}` : null,
      m.ema200 != null ? `ema200=${m.ema200}` : null,
      m.avgSpread != null ? `avgspread=${m.avgSpread.toPrecision(3)}` : null,
      m.avgCommissionPerLot != null
        ? `commissionperlot=${m.avgCommissionPerLot.toFixed(2)}`
        : null,
      m.latestSignal ? `signal=${m.latestSignal}` : null,
    ].filter(Boolean);
    return `- ${bits.join(" · ")}`;
  });

  return [
    `MARKET DATA (ours, as of ${ctx.asOf ?? "unknown"}):`,
    ...rows,
    ctx.tradingEnabled === false
      ? "The bot is currently not opening new positions."
      : "",
    "",
    "Any figure not listed above is one you do not have. Say so rather than estimating it.",
  ]
    .filter(Boolean)
    .join("\n");
}
