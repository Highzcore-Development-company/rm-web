import { describe, expect, it } from "vitest";
import { progressOf, isGranularity, type Granularity } from "./progress";
import type { BotTrade } from "@/lib/workspace/types";

/** Only the columns progressOf reads. */
function trade(closeTs: string | null, pnl: number, extra: Partial<BotTrade> = {}) {
  return {
    close_ts: closeTs,
    pnl,
    commission: 0,
    swap: 0,
    ...extra,
  } as BotTrade;
}

describe("progressOf", () => {
  it("is empty when nothing has closed", () => {
    expect(progressOf([], "day")).toEqual([]);
    // An open trade has no result yet, so it belongs in no bucket.
    expect(progressOf([trade(null, 0)], "day")).toEqual([]);
  });

  it("nets commission and swap off, like every other figure", () => {
    // Both are stored negative and ADDED. A gross series would read better
    // than the account does, on the chart used to judge the strategy.
    const points = progressOf(
      [trade("2026-10-12T10:00:00Z", 10, { commission: -1.2, swap: -0.3 })],
      "day",
    );
    expect(points).toHaveLength(1);
    expect(points[0].net).toBeCloseTo(8.5, 10);
  });

  it("buckets by the day a trade CLOSED", () => {
    const points = progressOf(
      [
        trade("2026-10-12T23:50:00Z", 5),
        trade("2026-10-13T00:10:00Z", 7),
      ],
      "day",
    );
    expect(points.map((p) => p.key)).toEqual(["2026-10-12", "2026-10-13"]);
    expect(points.map((p) => p.net)).toEqual([5, 7]);
  });

  it("fills quiet days with zeroes between the first and last trade", () => {
    // A weekend the bot did not trade is information. Dropping it makes a gap
    // look like continuous activity and distorts the shape of the curve.
    const points = progressOf(
      [trade("2026-10-12T10:00:00Z", 5), trade("2026-10-15T10:00:00Z", 5)],
      "day",
    );
    expect(points.map((p) => p.key)).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
    ]);
    expect(points[1].trades).toBe(0);
    expect(points[1].net).toBe(0);
  });

  it("does not pad beyond the last trade", () => {
    // Padding to today would grow an empty tail every time the bot goes quiet.
    // The staleness badge says that, not the chart.
    const points = progressOf([trade("2020-01-01T10:00:00Z", 5)], "day");
    expect(points).toHaveLength(1);
  });

  it("runs the cumulative line through the gaps", () => {
    const points = progressOf(
      [
        trade("2026-10-12T10:00:00Z", 10),
        trade("2026-10-14T10:00:00Z", -4),
      ],
      "day",
    );
    expect(points.map((p) => p.cumulative)).toEqual([10, 10, 6]);
  });

  it("counts a scratch trade in neither column", () => {
    const [point] = progressOf([trade("2026-10-12T10:00:00Z", 0)], "day");
    expect(point.trades).toBe(1);
    expect(point.wins).toBe(0);
    expect(point.losses).toBe(0);
  });

  describe("weeks", () => {
    it("runs Monday to Sunday", () => {
      // 12 Oct 2026 is a Monday; 18 Oct is the Sunday that closes that week.
      const points = progressOf(
        [
          trade("2026-10-12T10:00:00Z", 1),
          trade("2026-10-18T23:00:00Z", 2),
          trade("2026-10-19T00:30:00Z", 4),
        ],
        "week",
      );
      expect(points).toHaveLength(2);
      expect(points[0].net).toBe(3);
      expect(points[1].net).toBe(4);
    });

    it("zero-pads the week number so keys sort chronologically", () => {
      // "2026-W9" would sort after "2026-W10" as a string.
      const [point] = progressOf([trade("2026-03-02T10:00:00Z", 1)], "week");
      expect(point.key).toMatch(/^\d{4}-W\d{2}$/);
    });
  });

  it("buckets months by calendar month", () => {
    const points = progressOf(
      [
        trade("2026-09-30T23:00:00Z", 3),
        trade("2026-10-01T01:00:00Z", 4),
      ],
      "month",
    );
    expect(points.map((p) => p.key)).toEqual(["2026-09", "2026-10"]);
  });

  it("agrees across granularities", () => {
    // The guarantee that makes three views of one series safe: a month must be
    // the sum of its weeks and of its days, or somebody adds them up and finds
    // a figure that does not reconcile.
    const trades = [
      trade("2026-10-01T10:00:00Z", 12.5),
      trade("2026-10-07T10:00:00Z", -4.25),
      trade("2026-10-14T10:00:00Z", 8),
      trade("2026-10-22T10:00:00Z", -1.75),
      trade("2026-10-29T10:00:00Z", 6),
    ];

    const totals = (g: Granularity) =>
      progressOf(trades, g).reduce(
        (acc, p) => ({ net: acc.net + p.net, trades: acc.trades + p.trades }),
        { net: 0, trades: 0 },
      );

    const byDay = totals("day");
    expect(totals("week").net).toBeCloseTo(byDay.net, 10);
    expect(totals("month").net).toBeCloseTo(byDay.net, 10);
    expect(totals("week").trades).toBe(byDay.trades);
    expect(totals("month").trades).toBe(byDay.trades);

    // And the cumulative line ends at the same place whichever bucket is used.
    for (const g of ["day", "week", "month"] as Granularity[]) {
      const points = progressOf(trades, g);
      expect(points[points.length - 1].cumulative).toBeCloseTo(byDay.net, 10);
    }
  });

  it("ignores an unparseable timestamp instead of producing an Invalid Date bucket", () => {
    const points = progressOf(
      [trade("not-a-date", 5), trade("2026-10-12T10:00:00Z", 2)],
      "day",
    );
    expect(points).toHaveLength(1);
    expect(points[0].net).toBe(2);
  });
});

describe("isGranularity", () => {
  it("accepts the three and rejects the rest", () => {
    expect(isGranularity("day")).toBe(true);
    expect(isGranularity("week")).toBe(true);
    expect(isGranularity("month")).toBe(true);
    expect(isGranularity("year")).toBe(false);
    expect(isGranularity(undefined)).toBe(false);
  });
});
