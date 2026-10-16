import { netOf } from "@/lib/admin/trading-pnl";
import type { BotTrade } from "@/lib/workspace/types";

/**
 * Progress over time, by day, week or month.
 *
 * Victor: "a chart of our progress fully details on months, weeks and days of
 * progress performance." Three granularities off ONE function, because the
 * three must agree — a monthly figure that is not the sum of its weeks is a
 * bug somebody finds by adding them up, and a separate code path per bucket is
 * how that happens.
 *
 * CUMULATIVE AND PER-BUCKET TOGETHER. The bars answer "how did we do that
 * week" and the line answers "where are we now"; either alone invites the
 * wrong reading. A run of small green bars looks like progress until the line
 * shows it has not recovered the drawdown before it.
 *
 * UTC, like everything else that groups trades — see trading-pnl.ts. A trade's
 * bucket is the one it CLOSED in.
 */

export type Granularity = "day" | "week" | "month";

export const GRANULARITIES: Granularity[] = ["day", "week", "month"];

export function isGranularity(value: string | undefined): value is Granularity {
  return value === "day" || value === "week" || value === "month";
}

export type ProgressPoint = {
  /** The bucket key: YYYY-MM-DD, YYYY-Www or YYYY-MM. Sortable as a string. */
  key: string;
  /** What to print on the axis. */
  label: string;
  /** Start of the bucket, for anything that needs a real instant. */
  startsAt: string;
  net: number;
  trades: number;
  wins: number;
  losses: number;
  /** Running total of `net` from the first bucket to this one. */
  cumulative: number;
};

/** Midnight UTC on the day this instant falls in. */
function startOfDay(at: Date): Date {
  return new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
  );
}

/**
 * The Monday of this instant's week, UTC.
 *
 * ISO weeks, so a week is Monday–Sunday. The alternative — seven days back
 * from today — makes every bucket boundary depend on when the page was opened,
 * which means two admins comparing "last week" are comparing different weeks.
 */
function startOfWeek(at: Date): Date {
  const day = startOfDay(at);
  // getUTCDay: 0 = Sunday. Sunday belongs to the week that began six days ago.
  const offset = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - offset * 86_400_000);
}

function startOfMonth(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
}

/** ISO week number, for the label. */
function isoWeek(at: Date): { year: number; week: number } {
  // Thursday decides the year an ISO week belongs to, which is why a week in
  // early January can carry the previous year's number.
  const thursday = new Date(startOfWeek(at).getTime() + 3 * 86_400_000);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      (startOfWeek(thursday).getTime() - startOfWeek(firstThursday).getTime()) /
        (7 * 86_400_000),
    );
  return { year: thursday.getUTCFullYear(), week };
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function bucketOf(
  at: Date,
  granularity: Granularity,
): { key: string; label: string; startsAt: Date } {
  if (granularity === "day") {
    const start = startOfDay(at);
    return {
      key: start.toISOString().slice(0, 10),
      label: `${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]}`,
      startsAt: start,
    };
  }

  if (granularity === "week") {
    const start = startOfWeek(at);
    const { year, week } = isoWeek(at);
    return {
      // Zero-padded so string ordering matches chronological ordering —
      // "2026-W9" would sort after "2026-W10".
      key: `${year}-W${String(week).padStart(2, "0")}`,
      label: `${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]}`,
      startsAt: start,
    };
  }

  const start = startOfMonth(at);
  return {
    key: start.toISOString().slice(0, 7),
    label: `${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}`,
    startsAt: start,
  };
}

/** Step one bucket forward, for filling gaps. */
function next(at: Date, granularity: Granularity): Date {
  if (granularity === "day") return new Date(at.getTime() + 86_400_000);
  if (granularity === "week") return new Date(at.getTime() + 7 * 86_400_000);
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
}

/**
 * Buckets with no trades are INCLUDED, as zeroes.
 *
 * A day the bot did not trade is information — a weekend, a holiday, or the
 * switch left off — and dropping it makes a gap look like continuous activity.
 * Worse, it distorts the shape: ten trading days spread over a month render as
 * ten adjacent bars, so a quiet fortnight disappears.
 *
 * Gaps are filled only BETWEEN the first and last bucket that hold trades.
 * Padding to today would add empty bars whenever the bot is quiet, and the
 * staleness badge is what says that, not the chart.
 */
export function progressOf(
  trades: BotTrade[],
  granularity: Granularity,
): ProgressPoint[] {
  const closed = trades.filter((t) => t.close_ts);
  if (closed.length === 0) return [];

  type Bucket = Omit<ProgressPoint, "cumulative">;
  const by = new Map<string, Bucket>();

  for (const trade of closed) {
    const at = new Date(trade.close_ts as string);
    if (Number.isNaN(at.getTime())) continue;

    const { key, label, startsAt } = bucketOf(at, granularity);
    const bucket = by.get(key) ?? {
      key,
      label,
      startsAt: startsAt.toISOString(),
      net: 0,
      trades: 0,
      wins: 0,
      losses: 0,
    };

    const value = netOf(trade);
    bucket.net += value;
    bucket.trades += 1;
    if (value > 0) bucket.wins += 1;
    else if (value < 0) bucket.losses += 1;

    by.set(key, bucket);
  }

  if (by.size === 0) return [];

  const filled: Bucket[] = [];
  const sorted = [...by.values()].sort((a, b) =>
    a.startsAt < b.startsAt ? -1 : a.startsAt > b.startsAt ? 1 : 0,
  );

  let cursor = new Date(sorted[0].startsAt);
  const end = new Date(sorted[sorted.length - 1].startsAt);

  // Bounded by construction: `cursor` always advances, and `end` is a bucket
  // start that `bucketOf` produced, so the walk lands on it exactly.
  while (cursor.getTime() <= end.getTime()) {
    const { key, label } = bucketOf(cursor, granularity);
    filled.push(
      by.get(key) ?? {
        key,
        label,
        startsAt: cursor.toISOString(),
        net: 0,
        trades: 0,
        wins: 0,
        losses: 0,
      },
    );
    cursor = next(cursor, granularity);
  }

  let running = 0;
  return filled.map((bucket) => {
    running += bucket.net;
    return { ...bucket, cumulative: running };
  });
}
