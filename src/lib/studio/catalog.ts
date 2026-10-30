// Highscore Studio — the product catalogue and the order-brief questions.
//
// One source of truth, shared by the public pricing page, the order form, the
// rate-card PDF and the server action that prices an order. NEVER trust a price
// sent from the browser: the client posts a `packageKey` plus add-on keys, and
// the server totals it up from here (see totalNgn()).
//
// We sell to the Nigerian market, so everything is priced and charged in Naira
// and settled through ALAT by Wema. Amounts are whole Naira as integers.
//
// ── The two rules this catalogue is built on ──────────────────────────────
//
// 1. MEDIA IS NEVER INSIDE A PACKAGE. Airtime, billboard rental and printing
//    are billed at the station's own rate plus 15% for the booking — and that
//    15% comes out of the 15–30% discount stations already give agencies, so
//    it costs the client nothing extra. This is not a detail: one 30-second
//    Channels spot is ₦200,000, and the old ₦220,000 "TV" tier promised live
//    television for less than the price of a single spot. Every one of those
//    bundles lost money on every sale.
//
// 2. THE TIERS CLIMB BY CAPABILITY, NOT BY CHANNEL. First you exist online,
//    then you have something to show, then real footage and a proper site,
//    then you are on air. Everything added along the way is something we can
//    produce in-house. The old ladder climbed by adding radio and then TV,
//    which are precisely the things that cost us money and travel nowhere.
//
// Personal and business work are priced separately on purpose. A business
// package carries commercial usage rights, scripting written around the
// client's offer, and broadcast-ready masters. Someone buying a birthday song
// for their mother is spending fun money.

export type ProjectType = 'church' | 'business' | 'birthday' | 'event' | 'political';

/** ₦1,234,567 — used everywhere a price is shown. */
export function formatNgn(n: number): string {
  return `₦${n.toLocaleString('en-NG')}`;
}

export type PackageGroup = 'personal' | 'business' | 'political';

export interface StudioPackage {
  key: string;
  name: string;
  /** Whole Naira. */
  priceNgn: number;
  /** Shown under the price on the card. */
  blurb: string;
  /** Itemised deliverables — what the client actually gets. */
  includes: string[];
  group: PackageGroup;
  /** Working days from payment to delivery. Drives the promised delivery date. */
  turnaroundDays: number;
  /** Price is a floor; the rest is scoped per job. */
  from?: boolean;
  /** Highlighted as the popular pick within its group. */
  featured?: boolean;
  /** Extra condition the customer should know before ordering. */
  note?: string;
  /**
   * What the ongoing work costs once the months included in the package run
   * out. Stated on the card on purpose — a client who reads it up front never
   * feels ambushed in month two, and continuing is a far easier conversation
   * than pitching a retainer cold.
   */
  monthlyAfterNgn?: number;
  /** e.g. "after the first month" — what the monthly price follows. */
  monthlyAfterNote?: string;
  /** What the same work costs elsewhere, for the card and the rate card. */
  marketValue?: string;
}

export const PACKAGES: StudioPackage[] = [
  /* ── Personal & occasions ─────────────────────────────────────────────
     The band plays once and goes home. The song stays.

     A live band at a Nigerian wedding is ₦300,000–₦1m for one performance,
     and the cheapest standalone pre-wedding shoot is ₦50,000. These are
     priced against that, not against a souvenir.                          */
  {
    key: 'short_song',
    name: 'The Gift',
    priceNgn: 45_000,
    group: 'personal',
    turnaroundDays: 3,
    blurb: 'A one-minute song for one person, on their day.',
    includes: [],
  },
  {
    key: 'occasion_song',
    name: 'The Special',
    priceNgn: 120_000,
    group: 'personal',
    turnaroundDays: 5,
    featured: true,
    blurb: 'A real song, written from their actual story.',
    includes: [],
    marketValue: 'A live band plays once for ₦300,000–₦1m',
  },
  {
    key: 'occasion_film',
    name: 'The Full Story',
    priceNgn: 280_000,
    group: 'personal',
    turnaroundDays: 7,
    blurb: 'The song, the film, and the record that outlives the day.',
    includes: [],
    note: 'The song goes live on Spotify and Apple Music about two weeks after delivery.',
  },

  /* ── Business & brands ────────────────────────────────────────────────
     Each tier is everything before it, plus a new capability. The website is
     the hook: a Nigerian SME already budgets ₦250,000–₦400,000 for one, so
     including it stops the price being a question.                        */
  {
    key: 'business_starter',
    name: 'The Starter',
    priceNgn: 180_000,
    group: 'business',
    turnaroundDays: 7,
    blurb: 'For a business that exists but cannot be found.',
    includes: [],
    marketValue: '₦310,000–₦800,000 bought separately',
  },
  {
    key: 'business_brand_pack',
    name: 'The Brand Pack',
    priceNgn: 380_000,
    group: 'business',
    turnaroundDays: 14,
    featured: true,
    blurb: 'For a business ready to be seen, not just found.',
    includes: [],
    monthlyAfterNgn: 250_000,
    monthlyAfterNote: 'after the first month included',
    marketValue: '₦760,000–₦1.6m bought separately',
  },
  {
    key: 'business_launch',
    name: 'The Launch',
    priceNgn: 750_000,
    group: 'business',
    turnaroundDays: 21,
    blurb: 'For a business opening, relaunching, or finally taking itself seriously.',
    includes: [],
    monthlyAfterNgn: 350_000,
    monthlyAfterNote: 'after the three months included',
    marketValue: '₦1.6m–₦3m bought separately',
    note: 'Covers a filming day in Lagos. Outside Lagos we quote travel before we start.',
  },
  {
    key: 'business_campaign',
    name: 'The Full Campaign',
    priceNgn: 1_500_000,
    from: true,
    group: 'business',
    turnaroundDays: 30,
    blurb: 'For a business that wants the whole city to know.',
    includes: [],
    monthlyAfterNgn: 750_000,
    monthlyAfterNote: 'after the three months included',
    note: 'Airtime and billboard rental are billed separately at the station’s own rate, plus 15% for the booking.',
  },

  /* ── Political ────────────────────────────────────────────────────────
     The 2027 window is open: campaigning legally began 150 days before the
     16 January 2027 poll. Media houses charge campaigns a 31–50% premium as
     standard — a full-page newspaper is ₦920,000 political against ₦700,000
     commercial, and Channels applies a 50% political surcharge — so the
     production carries one too.                                           */
  {
    key: 'campaign_jingle',
    name: 'Campaign Jingle',
    priceNgn: 250_000,
    group: 'political',
    turnaroundDays: 5,
    blurb: 'The song they will be humming at the rally.',
    includes: [],
  },
  {
    key: 'campaign_pack',
    name: 'Campaign Pack',
    priceNgn: 850_000,
    group: 'political',
    turnaroundDays: 14,
    featured: true,
    blurb: 'The jingle, the films, and everything cut for every screen.',
    includes: [],
  },
  {
    key: 'campaign_full',
    name: 'Full Campaign',
    priceNgn: 2_000_000,
    from: true,
    group: 'political',
    turnaroundDays: 30,
    blurb: 'Everything, planned and placed, from now to polling day.',
    includes: [],
    note: 'Airtime and outdoor rental are billed separately at the station’s own rate, plus 15% for the booking.',
  },
];

