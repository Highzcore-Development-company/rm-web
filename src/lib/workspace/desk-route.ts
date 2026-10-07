// The desk's URLs.
//
// Every section is a real path — `/app/markets`, `/app/market/EUR-USD`,
// `/app/market/EUR-USD/details` — not `?tab=`. The difference matters for the
// three things a query string does badly: a refresh lands where you were, the
// Back button walks where you have been, and a link names what you are looking
// at rather than which page you happened to open.
//
// One catch-all route resolves all of it, so the workspace shell is built once.
// A folder per section would duplicate the shell eleven times and let them
// drift apart.

export const DESK_SECTIONS = [
  'scora', 'chart', 'markets', 'pending', 'orders', 'active', 'history',
  'backtests', 'alerts', 'performance', 'transactions', 'settings',
] as const;
export type DeskSection = (typeof DESK_SECTIONS)[number];

export interface DeskRoute {
  section: DeskSection;
  /** Market slug from `/app/market/<slug>`, if the URL names one. */
  marketSlug: string | null;
  /** True for `/app/market/<slug>/details` — the market's own screen. Without
   *  it a market in the URL only moves the chart, which is the distinction
   *  between looking at something and opening it. */
  details: boolean;
  /** Ticket from `/app/trade/<ticket>` — a closed trade opened from History. */
  ticket: number | null;
}

const isSection = (s: string): s is DeskSection =>
  (DESK_SECTIONS as readonly string[]).includes(s);

/** Parse the catch-all segments. Anything unrecognised falls back to Scora
 *  rather than erroring: a mistyped desk URL should land you on the desk. */
export function parseDeskRoute(slug: string[] | undefined): DeskRoute {
  const parts = (slug ?? []).filter(Boolean);
  const base: DeskRoute = { section: 'scora', marketSlug: null, details: false, ticket: null };
  if (parts.length === 0) return base;

  if (parts[0] === 'market' && parts[1]) {
    return {
      section: 'markets',
      marketSlug: decodeURIComponent(parts[1]),
      details: parts[2] === 'details',
      ticket: null,
    };
  }

  if (parts[0] === 'trade' && parts[1]) {
    const n = Number(parts[1]);
    return { ...base, section: 'history', ticket: Number.isFinite(n) ? n : null };
  }

  return isSection(parts[0]) ? { ...base, section: parts[0] } : base;
}

/** The path for a section — the inverse of the above, for navigation. */
export const deskPath = (section: DeskSection) =>
  section === 'scora' ? '/app' : `/app/${section}`;

/** The path for a market: chart-only, or its details screen. */
export const marketPath = (slug: string, details = false) =>
  `/app/market/${encodeURIComponent(slug)}${details ? '/details' : ''}`;

export const tradePath = (ticket: number) => `/app/trade/${ticket}`;
