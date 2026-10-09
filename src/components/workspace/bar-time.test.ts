import { describe, expect, it } from 'vitest';
import { inferBarSecs, timeToLogical, logicalToTime } from './bar-time';

const T0 = 1_700_000_000;
// 10 M15 bars, then a weekend-sized gap, then 5 more.
const bars = [
  ...Array.from({ length: 10 }, (_, i) => ({ time: T0 + i * 900 })),
  ...Array.from({ length: 5 }, (_, i) => ({ time: T0 + 9 * 900 + 172_800 + (i + 1) * 900 })),
];
const near = (a: number | null, b: number) => {
  expect(a).not.toBeNull();
  expect(Math.abs((a as number) - b)).toBeLessThan(1e-9);
};

describe('inferBarSecs', () => {
  it('regular M15', () => {
    expect(inferBarSecs(bars.slice(0, 10))).toBe(900);
  });
  it('weekend gap does not win', () => {
    expect(inferBarSecs(bars)).toBe(900);
  });
  it('fewer than two bars uses the fallback', () => {
    expect(inferBarSecs([])).toBe(900);
    expect(inferBarSecs([{ time: T0 }], 3600)).toBe(3600);
  });
});

describe('timeToLogical', () => {
  it('exact bar is an integer', () => {
    near(timeToLogical(bars, 900, bars[0].time), 0);
    near(timeToLogical(bars, 900, bars[4].time), 4);
    near(timeToLogical(bars, 900, bars[14].time), 14);
  });
  it('right of last is last + k', () => {
    near(timeToLogical(bars, 900, bars[14].time + 3 * 900), 17);
  });
  it('left of first is negative', () => {
    near(timeToLogical(bars, 900, bars[0].time - 2 * 900), -2);
  });
  it('inside a gap is fractional', () => {
    const mid = (bars[9].time + bars[10].time) / 2;
    near(timeToLogical(bars, 900, mid), 9.5);
  });
  it('empty is null', () => {
    expect(timeToLogical([], 900, T0)).toBeNull();
    expect(logicalToTime([], 900, 3)).toBeNull();
  });
});

describe('logicalToTime', () => {
  it('inverts timeToLogical in every region', () => {
    const ts = [
      bars[0].time - 5 * 900, bars[0].time, bars[3].time + 450,
      bars[9].time, (bars[9].time + bars[10].time) / 2, bars[12].time,
      bars[14].time, bars[14].time + 7 * 900,
    ];
    for (const t of ts) {
      const L = timeToLogical(bars, 900, t) as number;
      near(logicalToTime(bars, 900, L), t);
    }
  });
});
