/**
 * Prices, at the number of decimals a broker actually quotes.
 *
 * WHY THIS EXISTS. `bot_market_state.level` is a MEAN of recent swing levels,
 * so it arrives as a float with the full error term attached —
 * `190.461333333333`, eighteen characters. Rendered with String() in a narrow
 * column it does not wrap and does not shrink, so it widens whatever contains
 * it: on a phone the pending menu grew past the screen and clipped its own
 * text on the left, and the page could only be read zoomed out.
 *
 * It is also simply wrong. No broker quotes AUDJPY to twelve decimals, and a
 * number carrying more precision than the instrument has invites somebody to
 * believe the last ten digits mean something.
 *
 * DIGITS ARE INFERRED FROM MAGNITUDE, which is the part worth being honest
 * about. The real answer is the broker's `digits` for that symbol, which the
 * bot knows and does not publish per market row. Magnitude gets it right for
 * everything we trade: JPY crosses quote at 3 and sit above 50, every other
 * FX pair quotes at 5 and sits below 10, and crypto is big enough to want 2.
 * The moment a symbol breaks that, publish the real digits and use them here.
 */

export function priceDigits(value: number): number {
  const n = Math.abs(value);
  if (n >= 1000) return 2;   // BTCUSD, ETHUSD
  if (n >= 50) return 3;     // JPY crosses — USDJPY, AUDJPY, GBPJPY
  if (n >= 10) return 4;     // the odd high-priced cross
  return 5;                  // every other FX pair
}

/**
 * A price as text, or an em dash.
 *
 * Null, undefined and NaN all render as "—" rather than "0" or "NaN": a
 * missing price is a missing answer, and a zero is a claim about the market.
 */
export function formatPrice(value: number | null | undefined): string {
  if (value == null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(priceDigits(n));
}

/**
 * An amount of money somebody typed, as a number.
 *
 * WHY THIS EXISTS. The profit target box used bare `Number()`, and
 * `Number("5$")` is NaN — so typing the amount the way Victor wrote it,
 * "keep it at 5$", was rejected as "must be a number greater than zero".
 * The value was fine; the parser was fussy, and it said so in a way that
 * sounds like the user got it wrong.
 *
 * Accepts a leading or trailing currency symbol, thousands separators and
 * surrounding space. Deliberately does NOT accept anything else: "5 or 6" is
 * not a number, and quietly reading it as 5 would set a live profit target
 * from a guess.
 *
 * Returns null for blank — which is a real setting here, meaning "no target"
 * — and NaN for input that is not a number, so the caller can tell the two
 * apart. They mean opposite things: one clears the target, the other must be
 * refused.
 */
export function parseMoney(typed: string): number | null {
  const trimmed = typed.trim();
  if (trimmed === "") return null;

  // Currency symbols at either end, and separators between digits.
  const cleaned = trimmed
    .replace(/^[$£€]\s*/, "")
    .replace(/\s*[$£€]$/, "")
    .replace(/,/g, "")
    .trim();

  // Anchored: "5abc" must not parse as 5. parseFloat would take it.
  if (!/^\d*\.?\d+$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}
