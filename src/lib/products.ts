/**
 * HS-WEB-v1 — the company, product by product.
 *
 * ONE SOURCE FOR THE INDEX AND THE PAGES. The root page names every product
 * in one line each and links into it; each product page expands the same
 * entry. Holding them in two places guarantees the day the root describes
 * something the page no longer is.
 *
 * THE SHAPE IS THE BRIEF'S OWN TEST. Page three: four questions, answered the
 * moment the page loads — what it is, who it is for, how to start, why us —
 * "if any one of them is missing, the page is not finished". So they are four
 * required fields rather than prose, and a product that cannot fill one
 * cannot quietly ship without it.
 *
 * A TS MODULE RATHER THAN messages/en.json, deliberately, even though the
 * rest of the marketing site is translated. This is structured content, not
 * strings: the index renders `tagline`, the page renders all four answers,
 * and the type is what stops a half-filled product reaching a visitor. It is
 * also one file for whoever writes the copy, which is Olivia's half of this
 * brief.
 */

export type Product = {
  /** The subdomain, and the route under the current domain. */
  slug: string;
  /** Appears on the index and in the page title. */
  name: string;
  /** The one line on the index. The brief: "one line each". */
  tagline: string;

  // The four questions. All required — see above.

  /** In one sentence, what this product does. No jargon. */
  what: string;
  /** The person or business who should care, named plainly. */
  who: string;
  /** The one next step. One button. */
  start: { label: string; href: string; note?: string };
  /**
   * Proof. What we have done, a result, a reason to believe it.
   *
   * PROOF WE ACTUALLY HAVE, or the field says what is missing. An invented
   * client result on an investor-facing page is the one thing here that
   * cannot be undone by an edit later, so a product with nothing to point at
   * says so and gets content from Olivia rather than a number from nowhere.
   */
  why: { claim: string; detail: string }[];
  /** False while the page is honest but unfinished — see `why`. */
  ready: boolean;

  /**
   * What it actually does, three to six of them.
   *
   * SEPARATE FROM `why`. `why` is proof — results and reasons to believe us.
   * These are capabilities: the things somebody gets. A page that only
   * answers "why us" and never says what the product DOES is a page of
   * adjectives, which is what /analysis, /blog and /docs were.
   */
  features?: { title: string; body: string }[];

  /** How somebody actually uses it, in order. Empty when it needs no steps. */
  steps?: { title: string; body: string }[];
};

export const PRODUCTS: Product[] = [
  {
    slug: "autotrade",
    name: "Autotrade",
    tagline: "AI trading bot for businesses.",
    what:
      "Our bot trades a business's own brokerage account, automatically, to a " +
      "risk limit the business sets.",
    who:
      "Businesses with capital to put to work who do not want to run a trading " +
      "desk to do it.",
    start: {
      label: "Apply for managed trading",
      href: "/app/signup?type=investor",
      note: "We review it, speak to you, and set the account up together.",
    },
    why: [
      {
        claim: "The money never leaves your account",
        detail:
          "It stays in your company's own Vantage account, in your name. We " +
          "are granted permission to trade it and never to withdraw it.",
      },
      {
        claim: "Every trade is recorded and reviewable",
        detail:
          "Entry, stop, target, and what every indicator read at the moment " +
          "it opened — kept per trade, not summarised away.",
      },
      {
        claim: "A person checks the bot's work",
        detail:
          "Each setup is checked against the chart before it fires, and the " +
          "disagreements are written down.",
      },
    ],
    ready: true,
  },
  {
    slug: "analysis",
    name: "Scora",
    tagline: "AI trading analysis, for traders who decide for themselves.",
    what:
      "Scora reads the live market with you — trend, momentum, volatility and " +
      "cost — and answers questions about it in plain language.",
    who:
      "Traders who place their own trades and want a second read before they " +
      "do.",
    start: {
      label: "See the plans",
      href: "/pricing",
      note: "A subscription. No brokerage account required.",
    },
    why: [
      {
        claim: "It reads the same data the bot trades on",
        detail:
          "Twenty-eight markets, live: trend on two timeframes, ADX, RSI, ATR, " +
          "and the spread and commission actually charged on recent fills.",
      },
      {
        claim: "It says what it does not know",
        detail:
          "Where there is no reading, it says so rather than filling the gap.",
      },
      {
        claim: "You place every trade yourself",
        detail:
          "Scora never touches an account. It answers, and the decision stays " +
          "where it was — with you.",
      },
    ],
    features: [
      {
        title: "Ask it about any market",
        body: "In plain language. What is EURUSD doing, is gold trending, why has the spread widened — and it answers from the live reading rather than from training data.",
      },
      {
        title: "Trend on two timeframes",
        body: "The entry chart and the one above it, because a move that looks clean on fifteen minutes can be a pullback in a bigger trend going the other way.",
      },
      {
        title: "Volatility and momentum",
        body: "ATR, ADX, RSI and Bollinger position — the numbers that say whether a market is trending, ranging or stretched, and by how much.",
      },
      {
        title: "What the trade actually costs",
        body: "Spread and commission measured from recent real fills on that market, not a published figure. Cost is half of whether an edge survives.",
      },
      {
        title: "The bot's own reading, beside yours",
        body: "What our trading bot thinks of the same market right now — its structure read, the level it is watching and why it has not entered.",
      },
      {
        title: "Honest about gaps",
        body: "Where a reading is missing it says so. A confident answer built on nothing is worse than no answer.",
      },
    ],
    steps: [
      { title: "Sign in", body: "No brokerage account needed. Scora never trades." },
      { title: "Pick a market", body: "Twenty-eight of them, forex and crypto, updating live." },
      { title: "Ask", body: "In your own words, and keep asking. The context stays." },
    ],
    ready: true,
  },
  {
    slug: "build",
    name: "Highscore Build",
    tagline: "We build software for businesses.",
    what:
      "We design and build software for businesses — web applications, " +
      "internal tools, and the systems behind them.",
    who:
      "Businesses who need something built properly and do not have the team " +
      "to build it.",
    start: {
      label: "See the work",
      href: "/build",
      note: "Ten projects, written up — the problem, what we built, what happened.",
    },
    why: [
      {
        claim: "Ten projects you can read in full",
        detail:
          "Commerce, real estate, schools, clinics and games — each with the " +
          "problem, what we built and what changed afterwards.",
      },
      {
        claim: "We run our own products on what we build",
        detail:
          "The trading platform, the analysis product and the staff system " +
          "behind this company are ours, in production, used daily.",
      },
      {
        claim: "Shipped, not pitched",
        detail:
          "Every project listed is live or was delivered. There is no " +
          "roadmap section on this page.",
      },
    ],
    ready: true,
  },
  {
    slug: "studio",
    name: "Highscore Studio",
    tagline: "Media and content, for brands that need to be seen.",
    what:
      "We make the content a brand is known by — what gets published, and how " +
      "it reads.",
    who: "Brands who are doing good work that nobody has heard about yet.",
    start: {
      label: "Book a call",
      href: "/contact?from=studio",
      note: "Tell us who you are trying to reach.",
    },
    why: [],
    // NOT READY: no proof at all. Deliberately empty rather than padded —
    // see the note on `why`.
    ready: false,
  },
  {
    slug: "blog",
    name: "The blog",
    tagline: "What we publish — the posts and the writing.",
    what:
      "What we are learning as we build and trade, written down as it happens.",
    who: "Anyone deciding whether we know what we are doing.",
    start: { label: "Read the latest", href: "/blog" },
    features: [
      {
        title: "What we are learning as we build",
        body: "Written while it is happening rather than tidied up afterwards — including the things that did not work.",
      },
      {
        title: "The trades, reviewed",
        body: "What the bot did, what it read, and whether the person checking it agreed.",
      },
      {
        title: "How the products are made",
        body: "The decisions behind what we ship, and why we took one route over another.",
      },
    ],
    why: [
      {
        claim: "Written by the people doing the work",
        detail:
          "The person checking the bot's trades is the person writing about " +
          "them.",
      },
    ],
    // NOT READY: there are no posts yet, and a blog with nothing on it is
    // worse than no blog.
    ready: false,
  },
  {
    slug: "docs",
    name: "Documentation",
    tagline: "How the products work, for users and staff.",
    what:
      "How to use what we have built — the trading platform, the analysis, and " +
      "the staff system.",
    who: "Customers using the products, and staff running them.",
    start: { label: "Open the docs", href: "/docs" },
    features: [
      {
        title: "For customers",
        body: "How to use Scora, how managed trading works, what we can and cannot do with your account.",
      },
      {
        title: "For staff",
        body: "How the platform runs — permissions, the bot controls, and what every setting changes.",
      },
      {
        title: "Written against the real thing",
        body: "Every page describes the product as it is now, not as it was specified.",
      },
    ],
    why: [
      {
        claim: "Written against the real thing",
        detail:
          "Every page describes the product as it is now, not as it was " +
          "specified.",
      },
    ],
    ready: false,
  },
];

export function productBySlug(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}

/**
 * The products a visitor should be sent to.
 *
 * An unfinished page still EXISTS — the brief is explicit that "a product
 * without a page of its own does not exist to a visitor" — so nothing is
 * hidden. This is for places that want the ones we can stand behind first.
 */
export const READY_PRODUCTS = PRODUCTS.filter((p) => p.ready);
