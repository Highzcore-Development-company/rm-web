import { describe, expect, it } from "vitest";
import { rangeFor, isRangeKey, RANGE_KEYS, RANGE_LABELS } from "./ranges";

/** A fixed "now" — mid-afternoon on Thursday 16 October 2026, UTC. */
const NOW = new Date("2026-10-16T14:32:11.000Z");

describe("rangeFor", () => {
  it("treats today as the calendar day, not the last 24 hours", () => {
    const { from, to } = rangeFor("today", NOW);
    expect(from).toBe("2026-10-16T00:00:00.000Z");
    // Exclusive upper bound at tomorrow's midnight, so a trade closing at
    // 23:59 today is still inside the range.
    expect(to).toBe("2026-10-17T00:00:00.000Z");
  });

  it("counts today as one of the N days", () => {
    // "2 days" is today and yesterday, not today and the two before it.
    expect(rangeFor("2d", NOW).from).toBe("2026-10-15T00:00:00.000Z");
    expect(rangeFor("3d", NOW).from).toBe("2026-10-14T00:00:00.000Z");
    expect(rangeFor("7d", NOW).from).toBe("2026-10-10T00:00:00.000Z");
  });

  it("makes 1w the same span as 7d", () => {
    // Both are offered because they are the same question in two
    // vocabularies. If they ever diverge, one of the two labels is lying.
    expect(rangeFor("1w", NOW)).toEqual(rangeFor("7d", NOW));
  });

  it("steps whole calendar months, not 30 days", () => {
    expect(rangeFor("1m", NOW).from).toBe("2026-09-16T00:00:00.000Z");
    expect(rangeFor("3m", NOW).from).toBe("2026-07-16T00:00:00.000Z");
  });

  it("leaves both ends open for all time", () => {
    expect(rangeFor("all", NOW)).toEqual({ from: null, to: null });
  });

  it("does not move the upper bound with the clock", () => {
    // Two reads minutes apart must produce the same window, or a figure that
    // should be stable appears to drift on refresh.
    const early = rangeFor("7d", new Date("2026-10-16T00:00:30.000Z"));
    const late = rangeFor("7d", new Date("2026-10-16T23:59:30.000Z"));
    expect(early).toEqual(late);
  });

  describe("custom", () => {
    it("pushes the chosen end date to the end of that day", () => {
      // The admin picks an inclusive end date. Without the push, a range
      // ending "today" would exclude everything that happened today.
      const { from, to } = rangeFor("custom", NOW, {
        from: "2026-10-01",
        to: "2026-10-16",
      });
      expect(from).toBe("2026-10-01T00:00:00.000Z");
      expect(to).toBe("2026-10-17T00:00:00.000Z");
    });

    it("accepts a half-open range", () => {
      // "Since the cutover, to whenever" is a real question.
      expect(rangeFor("custom", NOW, { from: "2026-10-09" })).toEqual({
        from: "2026-10-09T00:00:00.000Z",
        to: null,
      });
    });

    it("drops an unparseable date rather than producing NaN bounds", () => {
      // An Invalid Date reaching the query filters every row out silently.
      expect(rangeFor("custom", NOW, { from: "not-a-date" }).from).toBeNull();
    });

    it("is all-time when nothing is picked", () => {
      expect(rangeFor("custom", NOW, {})).toEqual({ from: null, to: null });
    });
  });
});

describe("isRangeKey", () => {
  it("accepts every key and rejects anything else", () => {
    for (const key of RANGE_KEYS) expect(isRangeKey(key)).toBe(true);
    expect(isRangeKey("30d")).toBe(false);
    expect(isRangeKey(undefined)).toBe(false);
  });
});

it("labels every key", () => {
  // A key with no label renders as blank in the picker.
  for (const key of RANGE_KEYS) expect(RANGE_LABELS[key]).toBeTruthy();
});
