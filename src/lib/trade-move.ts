/**
 * The percentage move on the instrument, signed by whether it went the trade's
 * way.
 *
 * Pulled out of the notification job and tested on its own because the sell
 * case is easy to get backwards and expensive if you do: a short that closes
 * BELOW its entry made money, so the raw price change has to be flipped. Get
 * it wrong and every investor is emailed that they lost on their winners,
 * which is both alarming and the opposite of true.
 *
 * It is the move on the INSTRUMENT, deliberately not a cash figure. Each
 * account's size is whatever Vantage allocated it through the MAM, so the only
 * honest number to send everybody is the percentage.
 */
export function instrumentMovePercent(
  side: string,
  openPrice: number | null | undefined,
  closePrice: number | null | undefined,
): number | null {
  if (openPrice == null || closePrice == null) return null;
  // Guard the divide rather than returning Infinity: a zero or negative entry
  // price is bad data, and "+Infinity%" in somebody's inbox is worse than
  // saying nothing about the size of the move.
  if (!Number.isFinite(openPrice) || openPrice <= 0) return null;
  if (!Number.isFinite(closePrice)) return null;

  const raw = ((closePrice - openPrice) / openPrice) * 100;
  return side.toLowerCase() === "sell" ? -raw : raw;
}
