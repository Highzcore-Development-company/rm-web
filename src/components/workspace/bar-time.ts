// Ported from highscore-tech-web (src/components/admin/bot/drawing/barTime.ts).
// lightweight-charts only answers timeToCoordinate for an exact bar time and
// coordinateToTime returns null right of the last bar, which is exactly where a
// trader wants to draw. A point is stored as a time and projected through a
// logical bar index instead (fractional inside gaps, extrapolated past either
// end at one bar interval per index). Pure: no chart imports.

export interface BarLike { time: number }

/** Smallest positive spacing over the last 50 bars - weekends and holidays are
 *  gaps, never the interval. Falls back when there are fewer than two bars. */
export function inferBarSecs(bars: readonly BarLike[], fallback = 900): number {
  if (bars.length < 2) return fallback;
  let best = Infinity;
  for (let i = Math.max(1, bars.length - 49); i < bars.length; i++) {
    const d = bars[i].time - bars[i - 1].time;
    if (d > 0 && d < best) best = d;
  }
  return Number.isFinite(best) ? best : fallback;
}

/** Largest index whose time is <= t, or -1 when t is before the first bar. */
function floorIndex(bars: readonly BarLike[], t: number): number {
  let lo = 0;
  let hi = bars.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

export function timeToLogical(bars: readonly BarLike[], barSecs: number, t: number): number | null {
  if (!bars.length) return null;
  const last = bars.length - 1;
  if (t < bars[0].time) return (t - bars[0].time) / barSecs;
  const i = floorIndex(bars, t);
  if (i === last) return last + (t - bars[last].time) / barSecs;
  return i + (t - bars[i].time) / (bars[i + 1].time - bars[i].time);
}

/** Exact inverse of timeToLogical. */
export function logicalToTime(bars: readonly BarLike[], barSecs: number, L: number): number | null {
  if (!bars.length) return null;
  const last = bars.length - 1;
  if (L < 0) return bars[0].time + L * barSecs;
  if (L >= last) return bars[last].time + (L - last) * barSecs;
  const i = Math.floor(L);
  return bars[i].time + (L - i) * (bars[i + 1].time - bars[i].time);
}
