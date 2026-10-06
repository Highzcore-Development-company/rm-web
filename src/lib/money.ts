/**
 * P2-309 — currency handling.
 *
 * The price is USD. NGN is shown at a stored rate so a Nigerian investor can
 * see what the transfer will cost them, and both figures are recorded against
 * the payment because the NGN figure is what they actually paid.
 *
 * WHO ABSORBS FX MOVEMENT: we do, within a term. The investor is quoted a
 * fixed NGN amount at the rate stored on their payment row; if the naira moves
 * before they renew, the next term is quoted at the new rate. A term already
 * paid is never re-billed. That makes our USD revenue slightly variable and the
 * investor's bill predictable, which is the right way round — they are the ones
 * who have to find the money.
 */

/** Rate scaling. Kept as an integer so the stored rate is exact. */
export const FX_SCALE = 1_000_000;

/**
 * Converts USD cents to NGN kobo at a scaled rate.
 *
 * `rateE6` is naira per dollar, times 10^6. 1 USD = ₦1,550 is 1_550_000_000.
 */
export function usdCentsToNgnKobo(cents: number, rateE6: number): number {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error(`usdCentsToNgnKobo: bad cents ${cents}`);
  }
  if (!Number.isInteger(rateE6) || rateE6 <= 0) {
    throw new Error(`usdCentsToNgnKobo: bad rate ${rateE6}`);
  }

  // cents -> kobo: (cents/100) * rate * 100 == cents * rate. The two factors
  // of 100 cancel, so the only division is removing the rate's scaling.
  // Rounded up: a bank transfer short by a kobo is a failed payment.
  return Math.ceil((cents * rateE6) / FX_SCALE);
}

/** USDT-TRC20 has 6 decimals, so micro-USDT is exact. */
export function usdCentsToMicroUsdt(cents: number): number {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error(`usdCentsToMicroUsdt: bad cents ${cents}`);
  }
  // 1 cent = 0.01 USDT = 10,000 micro-USDT. USDT is treated as 1:1 with USD;
  // the few basis points it drifts are not worth a price feed at $20.
  return cents * 10_000;
}

export function formatNgn(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function formatUsdt(microUsdt: number): string {
  return `${(microUsdt / 1_000_000).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })} USDT`;
}

/**
 * The rate used for quoting. A stored constant for now, deliberately: a live
 * feed that fails mid-checkout would either block payment or quote a stale
 * number without saying so. Moving to a feed means caching it here with an
 * explicit age limit, and refusing to quote NGN when it is too old rather than
 * guessing.
 *
 * TODO(Esther): confirm the rate with Victor before launch and set it here.
 */
export const QUOTED_USD_NGN_E6 = 1_550_000_000;
