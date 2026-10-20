/**
 * Date ranges for the admin history.
 *
 * Victor's list, verbatim: "today, 2 days, 3 days, 7 days, 1 week, 1 months
 * sorting anyhow we want to set the range".
 *
 * TODAY IS NOT "THE LAST 24 HOURS", and the difference matters on the page
 * that answers "how much did we make today". A trade that closed at 23:50 last
 * night belongs to yesterday, not to a rolling window that happens to still
 * contain it. So `today` is the calendar day and the rest are N calendar days
 * back INCLUDING today — which is also why `7d` and `1w` are the same span and
 * both are offered: they are the same question asked in two vocabularies, and
 * leaving one out means somebody reads the other as something it is not.
 *
 * UTC, like trading-pnl.ts, and for the same reason: the broker's day is the
 * unit the figures are grouped by, and a local-midnight boundary would move
 * trades between days depending on who is looking.
 */

export const RANGE_KEYS = [
  "today",
  "2d",
  "3d",
  "7d",
  "1w",
  // THE TRADING WEEK, Monday to Friday — not the rolling seven days "1w"
  // means. Victor, 19 Oct. Deliberately a separate key rather than a
  // redefinition: "1w" is already in URLs people have shared, and quietly
  // changing what a saved link returns is worse than adding a name.
  "week",
  "1m",
  "3m",
  "all",
  "custom",
] as const;

export type RangeKey = (typeof RANGE_KEYS)[number];

export type DateRange = {
  /** Inclusive ISO instant, or null for "since the beginning". */
  from: string | null;
  /** EXCLUSIVE upper bound. See below. */
  to: string | null;
};

export function isRangeKey(value: string | undefined): value is RangeKey {
  return value !== undefined && (RANGE_KEYS as readonly string[]).includes(value);
}

/** Midnight UTC at the start of the day this instant falls in. */
function startOfDay(at: Date): Date {
  return new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
  );
}

/** How many calendar days each key spans, counting today as one. */
const DAYS: Partial<Record<RangeKey, number>> = {
  today: 1,
  "2d": 2,
  "3d": 3,
  "7d": 7,
  "1w": 7,
};

/**
 * The window a key selects.
 *
 * `to` is EXCLUSIVE and sits at tomorrow's midnight rather than at "now".
 * Using `now` would silently drop a trade that closes while the page is open,
 * and — worse — make two reads of the same range disagree, which is how a
 * figure that should be stable appears to move on refresh.
 *
 * `1m` and `3m` are calendar months back from today, not 30 or 90 days. "One
 * month" means the same date last month to everybody reading the page.
 */
export function rangeFor(
  key: RangeKey,
  now: Date = new Date(),
  custom?: { from?: string | null; to?: string | null },
): DateRange {
  const midnight = startOfDay(now);
  const tomorrow = new Date(midnight.getTime() + 86_400_000);

  if (key === "all") return { from: null, to: null };

  if (key === "custom") {
    // A half-open custom range is valid and useful: "since the cutover, to
    // whenever" is a question an admin asks. Only the parts given are applied.
    const from = custom?.from ? startOfDay(new Date(custom.from)) : null;
    // The user picks an inclusive end date; the query wants an exclusive one,
    // so the chosen day is pushed to its own midnight + 1. Without this, a
    // range ending "today" excludes everything that happened today.
    const toPicked = custom?.to ? startOfDay(new Date(custom.to)) : null;
    const to = toPicked ? new Date(toPicked.getTime() + 86_400_000) : null;

    return {
      from: from && !Number.isNaN(from.getTime()) ? from.toISOString() : null,
      to: to && !Number.isNaN(to.getTime()) ? to.toISOString() : null,
    };
  }

  // The trading week. Monday 00:00 UTC up to Saturday 00:00, so a figure read
  // at the weekend still describes the week that just closed — the market is
  // shut and the weekend adds nothing, so rolling forward on Saturday would
  // replace a full week with an empty one.
  //
  // Mid-week it is Monday to NOW, which is what "this week so far" means to
  // somebody looking on a Wednesday.
  if (key === "week") {
    // getUTCDay: 0 is Sunday. Sunday belongs to the week that just ended, so
    // it counts back six days rather than starting a new one.
    const day = midnight.getUTCDay();
    const backToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(midnight.getTime() - backToMonday * 86_400_000);
    const saturday = new Date(monday.getTime() + 5 * 86_400_000);

    return {
      from: monday.toISOString(),
      // Whichever comes first: tomorrow mid-week, Saturday once the week is
      // done. Never past Saturday, or a Sunday reading would include nothing
      // and look like a dead week.
      to: (saturday < tomorrow ? saturday : tomorrow).toISOString(),
    };
  }

  const days = DAYS[key];
  if (days !== undefined) {
    const from = new Date(midnight.getTime() - (days - 1) * 86_400_000);
    return { from: from.toISOString(), to: tomorrow.toISOString() };
  }

  // Calendar months.
  const months = key === "1m" ? 1 : 3;
  const from = new Date(
    Date.UTC(
      midnight.getUTCFullYear(),
      midnight.getUTCMonth() - months,
      midnight.getUTCDate(),
    ),
  );
  return { from: from.toISOString(), to: tomorrow.toISOString() };
}

/** The label each key carries in the UI. */
export const RANGE_LABELS: Record<RangeKey, string> = {
  today: "Today",
  "2d": "2 days",
  "3d": "3 days",
  "7d": "7 days",
  "1w": "1 week",
  week: "This week (Mon–Fri)",
  "1m": "1 month",
  "3m": "3 months",
  all: "All time",
  custom: "Custom",
};
