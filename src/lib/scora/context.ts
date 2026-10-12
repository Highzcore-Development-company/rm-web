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
  state: string | null;
  /** The bot's own sentence for why it is in that state. */
  reason: string | null;
  price: number | null;
  level: number | null;
  latestSignal: string | null;
  spread: number | null;
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
  state: string | null;
  reason: string | null;
  price: number | null;
  level: number | null;
  latest_signal: string | null;
  spread: number | null;
  updated_at: string | null;
};

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

  const [marketRows, settings] = await Promise.all([
    client
      .from("bot_market_state")
      .select(
        "symbol, alias, timeframe, htf, entry_trend, htf_trend, state, reason, price, level, latest_signal, spread, updated_at",
      )
      // Only the columns Scora may state as fact. Not `select *`: a narrower
      // query is also a list of what the model is allowed to know.
      .then((r) => (r.data ?? []) as ScoraMarketRow[]),
    client
      .from("bot_settings")
      .select("trading_enabled, updated_at")
      .maybeSingle()
      .then((r) => r.data),
  ]);

  if (marketRows.length === 0) return EMPTY;

  const markets: MarketFacts[] = marketRows.map((m) => ({
    symbol: m.symbol,
    alias: m.alias,
    timeframe: m.timeframe,
    htf: m.htf,
    trend: m.entry_trend,
    htfTrend: m.htf_trend,
    state: m.state,
    reason: m.reason,
    price: m.price,
    level: m.level,
    latestSignal: m.latest_signal,
    spread: m.spread,
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
      m.price != null ? `price=${m.price}` : null,
      m.level != null ? `level=${m.level}` : null,
      m.spread != null ? `spread=${m.spread}` : null,
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
