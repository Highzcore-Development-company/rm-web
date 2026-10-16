import type { BotTrade } from "@/lib/workspace/types";

/**
 * Part-to-whole breakdowns, for the doughnut charts.
 *
 * COUNTS, NEVER SIGNED MONEY. A pie of profit and loss is a broken chart: the
 * slices would have to sum to a total that some of them subtract from, so a
 * market that lost $5 either disappears or is drawn as though it contributed.
 * Everything here is a count of trades, which genuinely is a whole made of
 * parts.
 *
 * Eight slices is the ceiling and it is enforced here rather than left to the
 * component. Past that a reader cannot tell two wedges apart whatever the
 * palette does, so the tail folds into "Other" — one honest slice instead of
 * nine indistinguishable ones.
 */

export type Slice = {
  label: string;
  value: number;
  /** Share of the whole, 0–1. */
  share: number;
};

export type Composition = {
  slices: Slice[];
  total: number;
};

/** The most slices worth drawing, including "Other". */
export const MAX_SLICES = 8;

/**
 * Folds a label→count map into slices, largest first, tail into "Other".
 *
 * `MAX_SLICES - 1` real slices leaves room for the Other wedge. When nothing
 * would be folded there is no Other wedge at all — an "Other: 0" slice is a
 * legend entry for nothing.
 */
export function slicesFrom(
  counts: Map<string, number>,
  max = MAX_SLICES,
): Composition {
  const sorted = [...counts.entries()]
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1]);

  const total = sorted.reduce((sum, [, value]) => sum + value, 0);
  if (total === 0) return { slices: [], total: 0 };

  const keep = sorted.slice(0, max - 1);
  const tail = sorted.slice(max - 1);

  const slices: Slice[] = keep.map(([label, value]) => ({
    label,
    value,
    share: value / total,
  }));

  if (tail.length > 0) {
    const value = tail.reduce((sum, [, count]) => sum + count, 0);
    slices.push({
      // Says how many got folded, so the wedge is not a mystery.
      label: `Other (${tail.length})`,
      value,
      share: value / total,
    });
  }

  return { slices, total };
}

/**
 * How trades end.
 *
 * The most useful composition on the page: if stop_loss dominates, that is the
 * story about the strategy, and it is invisible in a P&L total that nets the
 * winners against it.
 *
 * `close_reason` is the bot's own word for it. Nulls are counted as "unknown"
 * rather than dropped — a trade with no recorded reason still closed, and
 * silently excluding it would make the percentages describe a smaller set than
 * the total claims.
 */
export function howTradesEnd(trades: BotTrade[]): Composition {
  const counts = new Map<string, number>();
  for (const trade of trades) {
    if (!trade.close_ts) continue;
    const key = labelFor(trade.close_reason);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return slicesFrom(counts);
}

/** `stop_loss` → `Stop loss`. The column is machine-written; the chart is read. */
function labelFor(reason: string | null): string {
  if (!reason) return "Unknown";
  const words = reason.replace(/[_-]+/g, " ").trim();
  if (!words) return "Unknown";
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

/**
 * Which markets the bot is actually busy on.
 *
 * Trade COUNT per market, not result — "where is the effort going" is a
 * different question from "where is the money coming from", and only the first
 * one is a whole made of parts.
 *
 * NOT ON THE OVERVIEW any more, and the reason is worth keeping. With 28
 * markets trading at roughly even volume, seven slices plus "Other (21)" put
 * 54% of the chart in the Other wedge — technically correct and useless, since
 * the thing a reader wants to compare is inside the one slice that cannot be
 * broken down. More than about seven classes that all carry meaning is a
 * table, and /app/admin/markets already is one, sorted and complete.
 *
 * Kept because it is correct and cheap, and because a range narrow enough to
 * involve only a few markets makes it a good chart again.
 */
export function tradesByMarket(trades: BotTrade[]): Composition {
  const counts = new Map<string, number>();
  for (const trade of trades) {
    if (!trade.close_ts) continue;
    counts.set(trade.symbol, (counts.get(trade.symbol) ?? 0) + 1);
  }
  return slicesFrom(counts);
}

/**
 * Direction against result — did it win long or short?
 *
 * Four slices, every one meaningful, and it answers a question the dashboard
 * could not otherwise answer: Victor's first rule is never to trade against the
 * trend, so whether the bot earns its money long or short is how you tell
 * whether that rule is doing any work. A net total cannot show it and a win
 * rate averages the two together.
 *
 * Fixed order, like outcomeSplit — the colour for "Sell · lost" must mean the
 * same thing next week.
 */
export function directionSplit(trades: BotTrade[]): Composition {
  const order = ["Buy · won", "Buy · lost", "Sell · won", "Sell · lost"];
  const counts = new Map<string, number>(order.map((key) => [key, 0]));

  let total = 0;
  for (const trade of trades) {
    if (!trade.close_ts) continue;
    const net = (trade.pnl ?? 0) + (trade.commission ?? 0) + (trade.swap ?? 0);
    // A scratch belongs to neither column, and inventing a fifth slice for it
    // would make four categories into five to describe two trades. It is
    // counted in the total so the shares still describe every closed trade.
    total += 1;
    if (net === 0) continue;

    const side = String(trade.side ?? "").toLowerCase().startsWith("s")
      ? "Sell"
      : "Buy";
    const key = `${side} · ${net > 0 ? "won" : "lost"}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  if (total === 0) return { slices: [], total: 0 };

  return {
    total,
    slices: order
      .map((label) => ({
        label,
        value: counts.get(label) ?? 0,
        share: (counts.get(label) ?? 0) / total,
      }))
      .filter((slice) => slice.value > 0),
  };
}

/**
 * Won, lost, scratched.
 *
 * Three slices, and the third is why this is a chart rather than the win-rate
 * figure beside it: a scratch is neither, and the percentage above hides them
 * by design (it divides by decided trades only). Here they are visible.
 */
export function outcomeSplit(trades: BotTrade[]): Composition {
  let wins = 0;
  let losses = 0;
  let scratches = 0;

  for (const trade of trades) {
    if (!trade.close_ts) continue;
    // Net, like every other figure — a $1 gain that cost $1.50 in commission
    // is a loss, and counting it as a win overstates the rate.
    const net = (trade.pnl ?? 0) + (trade.commission ?? 0) + (trade.swap ?? 0);
    if (net > 0) wins += 1;
    else if (net < 0) losses += 1;
    else scratches += 1;
  }

  const counts = new Map<string, number>([
    ["Won", wins],
    ["Lost", losses],
    ["Scratched", scratches],
  ]);

  // Not sorted by size: won/lost/scratched is a fixed order a reader learns
  // once, and re-ordering it as the numbers move would mean the same colour
  // meant "won" one week and "lost" the next.
  const total = wins + losses + scratches;
  if (total === 0) return { slices: [], total: 0 };

  return {
    total,
    slices: [...counts.entries()]
      .filter(([, value]) => value > 0)
      .map(([label, value]) => ({ label, value, share: value / total })),
  };
}
