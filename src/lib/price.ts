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
