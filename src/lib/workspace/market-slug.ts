// Market names in a URL.
//
// The bot's symbols are the broker's: `EURUSD`, `VOL25`, and MT5 names as long
// as `Volatility 25 Index`. None of those belong in an address bar as-is — one
// is unreadable, one has spaces — so a market gets a slug, and the slug is
// stable enough to paste into a message.
//
// Kept in one file because both sides need the same answer: the server resolves
// a slug from the URL, the client builds one when you click a market. Two
// implementations of this would drift and produce links that 404 on refresh.

/** Currency codes the bot trades. Used only to decide where to hyphenate a
 *  pair — `EURUSD` reads as `EUR-USD`, which is how anyone would write it. */
const CODES = new Set([
  'EUR', 'USD', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF',
  'XAU', 'XAG', 'XPT', 'XTI', 'XBR',
]);

/**
 * `EURUSD` → `EUR-USD`, `VOL25` → `VOL25`, `Volatility 25 Index` → `VOLATILITY-25-INDEX`.
 *
 * Pass the alias when there is one: it is the short name the desk already
 * shows, and slugging the broker's full name gives an address nobody would
 * type twice.
 */
export function marketSlug(symbol: string, alias?: string | null): string {
  const base = (alias?.trim() || symbol).toUpperCase();
  const clean = base.replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (clean.length === 6 && CODES.has(clean.slice(0, 3)) && CODES.has(clean.slice(3))) {
    return `${clean.slice(0, 3)}-${clean.slice(3)}`;
  }
  return clean;
}

/**
 * A slug back to the symbol the bot knows, matched against the markets we
 * actually have.
 *
 * Matched rather than reversed, deliberately: slugging is lossy (spaces and
 * punctuation all become hyphens), so the only trustworthy answer is "which of
 * these markets slugs to this". Returns null for a slug naming no market,
 * which the page turns into a not-found rather than a blank chart.
 */
export function symbolFromSlug(
  slug: string,
  markets: { symbol: string; alias: string | null }[],
): string | null {
  const want = slug.trim().toUpperCase();
  const hit = markets.find((m) => marketSlug(m.symbol, m.alias) === want);
  if (hit) return hit.symbol;
  // A bare symbol also works, so older links and hand-typed ones resolve.
  const bare = markets.find((m) => m.symbol.toUpperCase() === want.replace(/-/g, ''));
  return bare?.symbol ?? null;
}
