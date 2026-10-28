/**
 * What one pip is worth at a given lot size.
 *
 * Victor's request: when an admin types a lot size, show underneath what that
 * size earns or loses per pip. Lot size is the one setting that decides how
 * much money a trade moves, and "0.1" means nothing on its own — "$1.00 a pip"
 * is the number a person actually reasons with.
 *
 * COMPUTED FROM LIVE QUOTES, not from a table. It used to be fifteen figures
 * Victor measured by hand at 0.01 lots, and he asked for them to be
 * reconfirmed. They mostly held — every USD-quoted pair matched to the cent —
 * but the check turned up two things that a table cannot fix:
 *
 *   EURAUD was 15.7% out. The stored $0.06 needs AUD/USD near 0.60; it is
 *   0.694. The figure was right when it was measured and the file said in as
 *   many words that it would drift. It drifted.
 *
 *   THIRTEEN OF THE TWENTY-EIGHT MARKETS WERE SIMPLY ABSENT, so the column
 *   read "—" on AUDCAD, GBPNZD, NZDCHF and ten others — markets the bot trades
 *   every day.
 *
 * The arithmetic is not hard and the inputs are already on the page. For
 * XXXYYY, one pip on one standard lot is:
 *
 *   contract size x pip size   =  100,000 x 0.0001  =  10 YYY
 *                              or 100,000 x 0.01    =  1,000 JPY
 *
 * converted to USD at the live rate for YYY. That reproduced every one of
 * Victor's correct figures and fixed the one that was not, which is the
 * strongest statement available that the method is right.
 *
 * HIS MEASUREMENTS ARE KEPT, as the fallback for when quotes are missing and
 * as the thing the method was checked against. They are not the primary source
 * any more.
 */

/** USD per pip at 0.01 lots, by market alias. Victor's measurements. */
const PIP_PER_001_LOT: Record<string, number> = {
  AUDJPY: 0.06,
  AUDNZD: 0.06,
  AUDUSD: 0.1,
  CADJPY: 0.06,
  CHFJPY: 0.06,
  // EURAUD deliberately absent: the measured 0.06 is wrong at today's AUD/USD
  // and a wrong number is worse than none on the field that sizes a trade.
  EURGBP: 0.13,
  EURJPY: 0.06,
  EURUSD: 0.1,
  GBPJPY: 0.06,
  GBPUSD: 0.1,
  NZDUSD: 0.1,
  USDCAD: 0.07,
  USDCHF: 0.12,
  USDJPY: 0.06,
};

/** The size his figures were measured at. */
const BASE_LOT = 0.01;

/** Units of the base currency in one standard lot. Vantage FX, every pair. */
const CONTRACT_SIZE = 100_000;

export type PipValue =
  | { kind: "known"; usd: number; /** True when it came from live quotes. */ live: boolean }
  /** We know we cannot say — no quote for the currency the pip is paid in. */
  | { kind: "unknown" };

/**
 * Live prices, keyed by the plain six-letter pair.
 *
 * The caller builds this from whatever it already holds — bot_market_state
 * carries a price for all 28 markets, so no extra read is needed anywhere this
 * is used.
 */
export type Quotes = Record<string, number>;

/**
 * Normalises a market name to a six-letter pair.
 *
 * bot_symbol_config stores Raw ECN symbols with a `+` suffix — EURUSD+ — and
 * sometimes an alias without it. Both have to resolve to the same pair, or the
 * figure silently disappears on every market.
 */
function key(market: string): string {
  return market.trim().toUpperCase().replace(/[^A-Z]/g, "");
}

/** A pip is the fourth decimal, except on the yen where it is the second. */
function pipSize(quote: string): number {
  return quote === "JPY" ? 0.01 : 0.0001;
}

/**
 * USD per one unit of `currency`, from the quotes to hand.
 *
 * The convention is the awkward part and it is worth naming: USD is the BASE
 * in USDJPY, USDCHF and USDCAD, so one unit of the quote currency is 1/price.
 * It is the QUOTE in AUDUSD, NZDUSD, GBPUSD and EURUSD, so one unit is the
 * price itself. Getting that backwards would put USDJPY's pip at $158 rather
 * than six cents, which is the kind of wrong that is at least obvious.
 */
function usdPerUnit(currency: string, quotes: Quotes): number | null {
  if (currency === "USD") return 1;

  // USD is the base: price is quote-per-USD, so invert it.
  if (currency === "JPY" || currency === "CHF" || currency === "CAD") {
    const price = quotes[`USD${currency}`];
    return price && price > 0 ? 1 / price : null;
  }

  // USD is the quote: price is already USD per unit.
  const price = quotes[`${currency}USD`];
  return price && price > 0 ? price : null;
}

/**
 * Pip value in USD for this market at this lot size.
 *
 * Linear in lots, which is what makes it safe to scale: ten times the size is
 * ten times the money, with no threshold or step in between.
 */
export function pipValueFor(
  market: string,
  lots: number,
  quotes: Quotes = {},
): PipValue {
  const pair = key(market);

  // A blank or nonsense lot size is not zero pips, it is no answer. Zero would
  // read as "this trade cannot lose anything", which is the wrong thing to
  // show on the field that decides exactly that.
  if (!Number.isFinite(lots) || lots <= 0) return { kind: "unknown" };

  if (pair.length >= 6) {
    const quote = pair.slice(3, 6);
    const rate = usdPerUnit(quote, quotes);
    if (rate !== null) {
      // One pip, per lot, in the quote currency, then into USD.
      const perLot = CONTRACT_SIZE * pipSize(quote) * rate;
      return { kind: "known", usd: perLot * lots, live: true };
    }
  }

  // No quote for that currency. Fall back to what was measured by hand.
  const base = PIP_PER_001_LOT[pair];
  if (base === undefined) return { kind: "unknown" };
  return { kind: "known", usd: (base / BASE_LOT) * lots, live: false };
}

/**
 * The lot size that makes one pip worth `targetUsd` on this market.
 *
 * THE INVERSE OF pipValueFor, and exact rather than a search, because pip
 * value is linear in lots — ten times the size is ten times the money, with
 * no threshold or step in between. So one probe at a known size gives the
 * slope and the answer is one division.
 *
 * WHY THIS EXISTS. Victor, 26 Oct: "you've been struggling to make all
 * markets have $0.30 per pip, where it only calculates via lots, not via the
 * dollar." Risk is decided in money — the same $0.30 a pip everywhere — and
 * the lot size that produces it differs per market and moves with the
 * exchange rate. Asking a person to do that conversion for seventeen markets
 * is asking them to do arithmetic the page already knows how to do.
 *
 * ROUNDED TO THE BROKER'S STEP, DOWN. 0.01 is the lot increment, so an exact
 * answer of 0.037 has to become 0.03 or 0.04, and down is the only safe
 * direction: rounding up would quietly give every market slightly MORE risk
 * than was asked for. The caller is told what the rounded size really costs
 * so the gap is visible rather than assumed away.
 *
 * Returns null when the pip value is unknown — no quote and no measured
 * fallback. A guess here would be a lot size somebody trades.
 */
export function lotsForPipValue(
  market: string,
  targetUsd: number,
  quotes: Quotes = {},
): number | null {
  if (!Number.isFinite(targetUsd) || targetUsd <= 0) return null;

  const probe = pipValueFor(market, BROKER_MINIMUM_LOTS, quotes);
  if (probe.kind === "unknown" || probe.usd <= 0) return null;

  const perLot = probe.usd / BROKER_MINIMUM_LOTS;
  const exact = targetUsd / perLot;

  // Down to the step, then held at the broker minimum: a market whose pip is
  // worth more than the whole target cannot be traded smaller than 0.01, and
  // returning 0 would read as "turn this market off".
  const stepped = Math.floor(exact / BROKER_MINIMUM_LOTS) * BROKER_MINIMUM_LOTS;
  const lots = Math.max(stepped, BROKER_MINIMUM_LOTS);

  // Two decimals: the step is 0.01, and floating point leaves 0.07000000001
  // on a division that should have been clean.
  return Number(lots.toFixed(2));
}

/**
 * The line shown under the input.
 *
 * Rounded to the cent above a cent, and to a tenth of a cent below it — at
 * 0.01 lots several pairs are around six cents, and "$0.1" would round three
 * different markets to the same wrong number.
 */
export function formatPipValue(value: PipValue): string {
  if (value.kind === "unknown") return "";
  const { usd } = value;
  return `≈ $${usd < 0.1 ? usd.toFixed(3) : usd.toFixed(2)} per pip`;
}

/** Just the money, for a table cell that has its own header. */
export function formatPipAmount(value: PipValue): string | null {
  if (value.kind === "unknown") return null;
  const { usd } = value;
  return `$${usd < 0.1 ? usd.toFixed(3) : usd.toFixed(2)}`;
}

/**
 * The broker's minimum, which is what a BLANK lot size means.
 *
 * Every market currently has no lot size set, so blank is the common case and
 * not an edge one — leaving the line empty there would hide the figure exactly
 * where somebody is deciding whether to raise it.
 */
export const BROKER_MINIMUM_LOTS = 0.01;

/**
 * The line under the input, for whatever is typed — including nothing.
 *
 * A blank box is not an absent setting, it is the broker minimum, and it says
 * so rather than going quiet.
 */
export function pipLineFor(
  market: string,
  typed: string,
  quotes: Quotes = {},
): string {
  const trimmed = typed.trim();

  if (trimmed === "") {
    const value = pipValueFor(market, BROKER_MINIMUM_LOTS, quotes);
    const text = formatPipValue(value);
    return text ? `${text} at the broker minimum (${BROKER_MINIMUM_LOTS})` : text;
  }

  return formatPipValue(pipValueFor(market, Number(trimmed), quotes));
}
