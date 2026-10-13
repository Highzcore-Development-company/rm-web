/**
 * What one pip is worth at a given lot size.
 *
 * Victor's request: when an admin types a lot size, show underneath what that
 * size earns or loses per pip. Lot size is the one setting that decides how
 * much money a trade moves, and "0.1" means nothing on its own — "$1.00 a
 * pip" is the number a person actually reasons with.
 *
 * THE FIGURES ARE HIS, measured on our account at 0.01 lots. They are not
 * derived: a pip's value depends on the quote currency and the account
 * currency, so EURGBP at $0.13 and USDJPY at $0.06 come from live conversion
 * rates rather than from any formula we could run here without live FX.
 *
 * WHICH MEANS THEY DRIFT. USDCHF is $0.12 a pip at 0.01 lots today because of
 * where USDCHF is; it will not be exactly that next month. So this is shown as
 * an approximation and labelled as one. It is for sizing a decision, never for
 * reconciling a figure — the broker's number is the broker's number.
 *
 * CRYPTO IS DELIBERATELY ABSENT. BTCUSD and ETHUSD are "depends on broker" in
 * his list, and a contract size we have not confirmed would produce a
 * confident wrong number on the markets where the mistake is most expensive.
 * Saying we do not know is the honest answer.
 */

/** USD per pip at 0.01 lots, by market alias. Victor's measurements. */
const PIP_PER_001_LOT: Record<string, number> = {
  AUDJPY: 0.06,
  AUDNZD: 0.06,
  AUDUSD: 0.1,
  CADJPY: 0.06,
  CHFJPY: 0.06,
  EURAUD: 0.06,
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

/** Markets he listed as broker-dependent rather than unknown to us. */
const BROKER_DEPENDENT = new Set(["BTCUSD", "ETHUSD"]);

export type PipValue =
  | { kind: "known"; usd: number }
  /** We know we cannot say — crypto, where contract size varies by broker. */
  | { kind: "broker" }
  /** A market not in the table at all. Different from "broker": nobody has measured it. */
  | { kind: "unknown" };

/**
 * Normalises a market name to the key in the table.
 *
 * bot_symbol_config stores Raw ECN symbols with a `+` suffix — EURUSD+ — and
 * sometimes an alias without it. Both have to find the same row, or the figure
 * silently disappears on every market.
 */
function key(market: string): string {
  return market.trim().toUpperCase().replace(/[^A-Z]/g, "");
}

/**
 * Pip value in USD for this market at this lot size.
 *
 * Linear in lots, which is what makes it safe to scale: ten times the size is
 * ten times the money, with no threshold or step in between.
 */
export function pipValueFor(market: string, lots: number): PipValue {
  const k = key(market);

  if (BROKER_DEPENDENT.has(k)) return { kind: "broker" };

  const base = PIP_PER_001_LOT[k];
  if (base === undefined) return { kind: "unknown" };

  // A blank or nonsense lot size is not zero pips, it is no answer. Zero would
  // read as "this trade cannot lose anything", which is the wrong thing to
  // show on the field that decides exactly that.
  if (!Number.isFinite(lots) || lots <= 0) return { kind: "unknown" };

  return { kind: "known", usd: (base / BASE_LOT) * lots };
}

/**
 * The line shown under the input.
 *
 * Rounded to the cent above a cent, and to a tenth of a cent below it — at
 * 0.01 lots several pairs are $0.06, and "$0.1" would round three different
 * markets to the same wrong number.
 */
export function formatPipValue(value: PipValue): string {
  if (value.kind === "broker") return "Pip value depends on the broker";
  if (value.kind === "unknown") return "";
  const { usd } = value;
  const amount = usd < 0.1 ? usd.toFixed(3) : usd.toFixed(2);
  return `≈ $${amount} per pip`;
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
export function pipLineFor(market: string, typed: string): string {
  const trimmed = typed.trim();

  if (trimmed === "") {
    const value = pipValueFor(market, BROKER_MINIMUM_LOTS);
    const text = formatPipValue(value);
    return text ? `${text} at the broker minimum (${BROKER_MINIMUM_LOTS})` : text;
  }

  return formatPipValue(pipValueFor(market, Number(trimmed)));
}
