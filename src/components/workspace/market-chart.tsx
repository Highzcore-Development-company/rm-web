'use client';

/* eslint-disable react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps --
 * VERBATIM PORT from highzcore (`components/admin/bot/MarketChart.tsx`), where
 * it has been running in production against the live desk.
 *
 * These four rules are React Compiler checks that rm-web enables and highzcore
 * does not. They fire on the imperative lightweight-charts bridge: the chart is
 * a mutable object held in a ref that must be read and written outside React's
 * render cycle, which is exactly what the library's API requires and exactly
 * what these rules exist to discourage in ordinary components.
 *
 * Disabled rather than rewritten on purpose. Reworking 3,000 lines of charting
 * code nobody here wrote, with no tests over it, to satisfy a lint rule would
 * risk breaking a working chart for no functional gain — and it would guarantee
 * this copy drifts from the original the first time either is touched.
 *
 * If the chart is ever genuinely refactored, delete this block and fix what it
 * reports. Do not extend it to new files.
 */


// Candlestick chart for one market, TradingView Lightweight Charts (MIT).
//
// Data is read STRAIGHT FROM SUPABASE in the browser — no Next.js API route, so
// no Netlify Function per tick. Access is gated by admin-only RLS
// (trading-bot-db/frontend_admin_read_policies.sql): only a logged-in admin or
// trading-bot staff can SELECT these tables; the anon key alone reads nothing.
//   • history  → bot_bars (OHLCV) + this market's bot_trades
//   • live     → bot_quotes (bid/ask) + bot_market_state (floating P&L), ~3s
//
// Overlays for an open position OR a resting PENDING order: a blue ENTRY line
// (solid once filled, dashed while the order is still pending) plus dashed SL/TP,
// all drawn by default. The selected market + timeframe persist across a refresh
// (localStorage). Client-side indicators (MA/EMA/Bollinger) and manual drawings
// (h-line/trend) are drawn on top.

import { useEffect, useRef, useState } from 'react';
import { createRmServerBrowserClient } from '@/lib/supabase/rm-server-browser';
import {
  CandlestickChart, MousePointer2, Minus, PenLine, Eraser, Maximize2, Minimize2,
  Crosshair, Search, Trash2, X, ChevronDown, LineChart, Grid3x3, BarChart3,
  Lock, Unlock, Eye, EyeOff, Type, Zap, Undo2, Redo2, Camera,
  Bookmark, FileText, Layers, Code2, Check, Star, ChevronsLeft, ChevronsRight,
  ChevronRight, Slash, MoveUpRight, ArrowLeftRight, ArrowRightToLine,
  GripVertical, MoreVertical, Copy, RotateCcw, GitFork,
} from 'lucide-react';
import { TimeAgo } from './bot-bits';
import {
  createChart, CandlestickSeries, LineSeries, LineStyle, createSeriesMarkers,
  type IChartApi, type ISeriesApi, type UTCTimestamp, type Time,
  type SeriesMarker, type IPriceLine, type ISeriesMarkersPluginApi,
  type MouseEventParams, type Logical,
} from 'lightweight-charts';
import { inferBarSecs, timeToLogical, logicalToTime } from './bar-time';

type Tool =
  | 'cursor' | 'hline' | 'trend' | 'text' | 'ray' | 'extended' | 'hray'
  | 'pitchfork' | 'cross' | 'vline' | 'info' | 'angle';

/** The drawing menu, in the design's order and wording. `clicks` is how many
 *  points a tool needs; `soon` is drawn but not armable, because a menu that
 *  hides what it cannot do sends you hunting for a tool that is not there. */
type DrawItem = {
  tool?: Tool; label: string; keys?: string; clicks?: 1 | 2 | 3; glyph: string; soon?: true;
};
const LINE_TOOLS: DrawItem[] = [
  { tool: 'trend', label: 'Trend Line', keys: 'Alt+T', clicks: 2, glyph: '/' },
  { tool: 'hline', label: 'Horizontal Line', keys: 'Alt+H', clicks: 1, glyph: '—' },
  { tool: 'ray', label: 'Ray', clicks: 2, glyph: '↗' },
  { tool: 'extended', label: 'Extended Line', clicks: 2, glyph: '↔' },
  { tool: 'vline', label: 'Vertical Line', keys: 'Alt+V', clicks: 1, glyph: '|' },
  { tool: 'hray', label: 'Horizontal Ray', clicks: 1, glyph: '⊢' },
  { tool: 'cross', label: 'Cross Line', clicks: 1, glyph: '+' },
  { tool: 'info', label: 'Info Line', clicks: 2, glyph: '⟋' },
  { tool: 'angle', label: 'Trend Angle', clicks: 2, glyph: '∠' },
];
const CHANNEL_TOOLS: DrawItem[] = [
  { label: 'Parallel Channel', glyph: '⫽', soon: true },
  { label: 'Disjoint Channel', glyph: '≻', soon: true },
  { label: 'Flat Top/Bottom', glyph: '⊐', soon: true },
  { label: 'Linear Regression', glyph: '≋', soon: true },
];
const PITCHFORK_TOOLS: DrawItem[] = [
  { tool: 'pitchfork', label: 'Pitchfork', clicks: 3, glyph: '⊢E' },
  { label: 'Schiff Pitchfork', glyph: '⊢E', soon: true },
  { label: 'Modified Schiff Pitchfork', glyph: '⊢E', soon: true },
  { label: 'Inside Pitchfork', glyph: '⊣E', soon: true },
];
/** The one tool of ours the design has no name for — it is the labelled
 *  horizontal line, and it belongs with the lines. */
const EXTRA_TOOLS: DrawItem[] = [
  { tool: 'text', label: 'Labelled Level', keys: 'Alt+L', clicks: 1, glyph: 'T' },
];

/** The rail button wears the CURRENT tool's icon, which is how the design
 *  tells you what a click will draw without a tooltip or an open menu — theirs
 *  shows a dash because Horizontal Line is selected, not because the button is
 *  a dash. */
const TOOL_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  hline: Minus,
  hray: ArrowRightToLine,
  trend: Slash,
  ray: MoveUpRight,
  extended: ArrowLeftRight,
  text: Type,
  pitchfork: GitFork,
  cross: Crosshair,
  vline: Minus,
  info: Slash,
  angle: Slash,
};

// One browser Supabase client for the module, pointed at the BOT project — the
// bot_* tables no longer live in the main app's database. There is no shared
// session across projects, so these reads are governed by the bot project's own
// RLS policies rather than by the logged-in user.
const supabase = createRmServerBrowserClient();

const STORE_KEY = 'bot-chart-selection'; // persists {symbol, tf} across a refresh

// v6: bot_bars now syncs 8 timeframes. The DB stores D1/W1 but Olivia's picker
// labels them Day1/WK1 — so keep label + value separate. M1 is deliberately NOT
// synced (Deriv caps its history); leaving it out avoids an empty chart.
// v7: bot_bars syncs ONLY M15 and H1 now — every other timeframe returns empty.
const TIMEFRAMES: { label: string; value: string }[] = [
  { label: 'M15', value: 'M15' },
  { label: 'H1', value: 'H1' },
];
const TF_VALUES = TIMEFRAMES.map((t) => t.value);

// The design's full timeframe menu. Only the two above have candles — bar_sync
// stores M15 and H1 (backend v7) — so the rest are listed and disabled rather
// than offered and then answered with an empty chart.
const ALL_TIMEFRAMES: { label: string; value: string }[] = [
  { label: '1m', value: 'M1' }, { label: '5m', value: 'M5' }, { label: '15m', value: 'M15' },
  { label: '30m', value: 'M30' }, { label: '1h', value: 'H1' }, { label: '4h', value: 'H4' },
  { label: '1D', value: 'D1' }, { label: '1W', value: 'W1' }, { label: '1M', value: 'MN1' },
];

// Likewise: the series is a candlestick series and the trade markers and SL/TP
// price lines hang off it, so the other six are shown and disabled.
const CHART_TYPES = [
  'Candles', 'Hollow Candles', 'Bars', 'Line', 'Area', 'Baseline', 'Heikin Ashi',
] as const;
const TF_SECONDS: Record<string, number> = {
  M15: 900, H1: 3600,
};
// The live quote only rolls a brand-new forming candle for intraday buckets,
// where UTC-epoch alignment matches the broker's bars. For H4 and higher we just
// extend the last historical bar with the live price (epoch buckets wouldn't line
// up with the broker's week/month boundaries and would paint a spurious bar).
const INTRADAY_MAX_SECS = 3600;

type Candle = { time: UTCTimestamp; open: number; high: number; low: number; close: number };

function utcTz(dateStrOrMs: string | number): UTCTimestamp {
  const ms = typeof dateStrOrMs === 'string' ? new Date(dateStrOrMs).getTime() : dateStrOrMs;
  return (Math.floor(ms / 1000) + new Date().getTimezoneOffset() * 60) as UTCTimestamp;
}
interface Trade {
  id: string; side: string; open_ts: string; open_price: number;
  close_ts: string | null; close_price: number | null; sl: number | null; tp: number | null;
  pnl: number | null; close_reason: string | null;
}

// A manual drawing, saved to localStorage so it survives a refresh. Horizontal
// lines + trend lines are stored as raw price/time so they can be re-rendered and
// dragged. Keyed per symbol+timeframe — a level drawn on VOL25 M15 is meaningless
// on EURUSD.
type Drawing =
  // `label` (optional) is what the text tool writes: a level that says WHY it
  // is there — "Asia high" — instead of a bare line you have to remember.
  /* colour, width and dash are per-drawing and optional: absent means the
   * defaults, which is what every drawing saved before the style toolbar
   * existed looks like. */
  | {
      id: string; kind: 'hline'; price: number; label?: string;
      color?: string; width?: number; style?: 'solid' | 'dashed' | 'dotted';
    }
  /* `reach` is how far the line runs beyond the two clicks that define it:
   *   segment  — between them and no further (the default, and what every
   *              existing saved drawing is, since they have no `reach`)
   *   ray      — from the first click through the second and onward
   *   extended — both directions, across the chart
   *   hray     — flat, from one click onward: a level that only applies from
   *              a moment, not one drawn across history it predates */
  | {
      id: string; kind: 'trend'; t1: number; v1: number; t2: number; v2: number;
      reach?: 'segment' | 'ray' | 'extended' | 'hray';
      color?: string; width?: number; style?: 'solid' | 'dashed' | 'dotted';
      /** Drawn as an overlay at the line's midpoint. A level's label rides the
       *  price axis; a diagonal has no fixed place there, which is the only
       *  reason labels started out limited to levels. */
      label?: string;
      /* INFO LINE and TREND ANGLE are trend lines that report on themselves,
       * so they are this kind with a readout rather than kinds of their own —
       * which means they inherit dragging, hit-testing and styling instead of
       * each needing its own copy. `readout` says which number to show; the
       * text is computed at render time, because a move or a drag changes it
       * and a stored string would go stale the moment you touched the line. */
      readout?: 'info' | 'angle';
    }
  /** A moment, marked. One click: no price, because it is about WHEN. */
  | {
      id: string; kind: 'vline'; t1: number; label?: string;
      color?: string; width?: number; style?: 'solid' | 'dashed' | 'dotted';
    }
  /** A time AND a price — the two lines crossing where you clicked. */
  | {
      id: string; kind: 'cross'; t1: number; v1: number; label?: string;
      color?: string; width?: number; style?: 'solid' | 'dashed' | 'dotted';
    }
  /* ANDREWS' PITCHFORK — three clicks, three lines.
   *
   * p1 is the pivot; p2 and p3 are the swing that followed it. The MEDIAN runs
   * from p1 through the midpoint of p2-p3 and onward; the two tines run from p2
   * and from p3, parallel to it. That is the whole construction, and it is why
   * this cannot be three trend lines drawn by hand: move any anchor and all
   * three lines have to be re-derived together.
   *
   * Stored as the three clicks only. The lines themselves are geometry, and
   * geometry recomputed at render time cannot drift out of step with the points
   * it came from — the same reason a ray stores its direction, not its end. */
  | {
      id: string; kind: 'pitchfork';
      t1: number; v1: number; t2: number; v2: number; t3: number; v3: number;
      color?: string; width?: number; style?: 'solid' | 'dashed' | 'dotted';
      /** Rides the median, the line the fork is actually read against. */
      label?: string;
    };

/** The palette the style toolbar offers. */
const DRAW_COLORS = ['#2962FF', '#26a69a', '#ef5350', '#f59e0b', '#a855f7', '#e5e7eb'];
const DRAW_WIDTHS = [1, 2, 3, 4] as const;
const DRAW_STYLES = [
  { key: 'solid', label: 'Solid', dash: '' },
  { key: 'dashed', label: 'Dashed', dash: '6 4' },
  { key: 'dotted', label: 'Dotted', dash: '2 3' },
] as const;
const lwStyle = (s?: string) =>
  s === 'dotted' ? LineStyle.Dotted : s === 'solid' ? LineStyle.Solid : LineStyle.Dashed;

/** A line of the overlay, in pane pixels. */
type Seg = {
  id: string; x1: number; y1: number; x2: number; y2: number;
  color: string; width: number; dash: string;
};
type Pt = { x: number; y: number };

/* ANDREWS' PITCHFORK, as pixels.
 *
 * ONE function for the committed fork and the one still being placed. They were
 * going to be two — syncLabels measuring the saved drawing, the preview drawing
 * a rubber band — and that is how a preview ends up showing something other
 * than what the click produces. The third point is the cursor until it is a
 * click; nothing else about the construction changes.
 *
 * Median: p1 through the midpoint of p2-p3. Tines: p2 and p3, parallel to it.
 * All three run forward from their own anchor, because a fork is read forward.
 * Pixels, not price, because "parallel" has to mean parallel on screen — price
 * and time have different units, so tines built in price space would splay
 * apart as soon as the axis rescaled.
 */
function forkSegments(
  p1: Pt, p2: Pt, p3: Pt, id: string,
  style: { color: string; width: number; dash: string },
  W: number, H: number,
): Seg[] {
  const mid = { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
  const dx = mid.x - p1.x, dy = mid.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return [];                       // all three on one spot
  const ux = dx / len, uy = dy / len;
  const far = (W + H) * 2;
  const { color, width, dash } = style;
  const ray = (from: Pt, segId: string): Seg => ({
    id: segId,
    x1: from.x, y1: from.y, x2: from.x + ux * far, y2: from.y + uy * far,
    color, width, dash,
  });
  return [
    // The median takes the drawing's own id — that is what puts a label on the
    // median rather than on an arbitrary tine.
    ray(p1, id),
    ray(p2, `${id}#tine-a`),
    ray(p3, `${id}#tine-b`),
    // The base: the swing the fork was built from, not one of the three lines
    // you trade. Always dashed and a touch thinner, whatever the fork's style.
    {
      id: `${id}#base`, x1: p2.x, y1: p2.y, x2: p3.x, y2: p3.y,
      color, width: Math.max(1, width - 1), dash: '4 4',
    },
  ];
}
/** One colour for everything a PERSON drew, so it never reads as something the
 *  bot put there. The bot's own overlays keep the up/down palette. */
const DRAW_COLOR = '#2962FF';
const DRAW_KEY = (sym: string, tf: string) => `bot-chart-draw:${sym}::${tf}`;
const INDS_KEY = 'bot-chart-inds'; // active indicators persist globally (a user pref)
const FAV_KEY = 'bot-chart-favs';  // starred markets, floated to the top of the search
const IND_FAV_KEY = 'bot-chart-ind-favs'; // starred indicators, for the library's Favorites
const newDrawId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
// Pixel distance from point (px,py) to segment (ax,ay)-(bx,by) — for grabbing a trend line.
function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const fmt = (n: number | null | undefined, digits: number) =>
  n == null || !Number.isFinite(Number(n)) ? '—' : Number(n).toFixed(digits);

/**
 * The two points a line is actually drawn between, once its reach is applied.
 *
 * lightweight-charts has no concept of an infinite line — a LineSeries is the
 * points you give it. So a ray is a segment recomputed to the edge of the data,
 * following the same slope. Bounded by the loaded candles (plus a fifth of the
 * range, so it visibly runs off the edge rather than stopping at the last bar):
 * extending to infinity would stretch the time scale until the candles were a
 * sliver.
 *
 * Re-derived on every render, which is what makes a ray keep reaching the edge
 * as new bars arrive instead of ending where it did when it was drawn.
 */
function extendLine(
  d: { t1: number; v1: number; t2: number; v2: number; reach?: string },
  bars: { time: UTCTimestamp }[],
  /** The times at the edges of what is on screen, when the caller knows them.
   *  A ray has to reach the edge of the PANE, not of the data — otherwise it
   *  visibly stops in mid-air as soon as you pan past its end. */
  view?: { from: number; to: number } | null,
): { time: UTCTimestamp; value: number }[] {
  const reach = d.reach ?? 'segment';
  const pts = [{ time: d.t1 as UTCTimestamp, value: d.v1 }, { time: d.t2 as UTCTimestamp, value: d.v2 }];
  if (reach === 'segment' || bars.length < 2) {
    return pts.sort((a, b) => (a.time as number) - (b.time as number));
  }

  const first = Math.min(bars[0].time as number, view?.from ?? Infinity);
  const last = Math.max(bars[bars.length - 1].time as number, view?.to ?? -Infinity);
  const pad = Math.max((last - first) * 0.25, 1);
  const lo = first - pad;
  const hi = last + pad;

  // Flat, from the click onward. One point, so no slope to follow.
  if (reach === 'hray') {
    return [{ time: d.t1 as UTCTimestamp, value: d.v1 }, { time: hi as UTCTimestamp, value: d.v1 }];
  }

  // Price per second along the line. A vertical pair has no slope to extend.
  const dt = d.t2 - d.t1;
  if (dt === 0) return pts;
  const m = (d.v2 - d.v1) / dt;
  const at = (t: number) => d.v1 + m * (t - d.t1);

  if (reach === 'extended') {
    return [{ time: lo as UTCTimestamp, value: at(lo) }, { time: hi as UTCTimestamp, value: at(hi) }];
  }

  // Ray: starts at the first click, runs through the second and onward — so
  // which edge it reaches depends on which way it was drawn.
  const end = dt > 0 ? hi : lo;
  return [
    { time: d.t1 as UTCTimestamp, value: d.v1 },
    { time: end as UTCTimestamp, value: at(end) },
  ].sort((a, b) => (a.time as number) - (b.time as number));
}

/* ── Symbol search ────────────────────────────────────────────────────────
 * Grouping and long names are derived from the symbol itself. Nothing in the
 * database describes an instrument, and a hand-kept table would rot the day the
 * broker adds a market — so an unrecognised symbol keeps its alias and lands in
 * "Other" rather than being labelled with a guess.
 */
type AssetClass = 'fx' | 'metal' | 'index' | 'commodity' | 'other';

const CLASS_TABS: { key: AssetClass | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'fx', label: 'Forex' },
  { key: 'metal', label: 'Metals' },
  { key: 'index', label: 'Indices' },
  { key: 'commodity', label: 'Commodities' },
];

const CLASS_TAG: Record<AssetClass, string> = {
  fx: 'FX', metal: 'METAL', index: 'INDEX', commodity: 'COMM', other: '',
};

const CURRENCY: Record<string, string> = {
  EUR: 'Euro', USD: 'U.S. Dollar', GBP: 'British Pound', JPY: 'Japanese Yen',
  AUD: 'Australian Dollar', NZD: 'New Zealand Dollar', CAD: 'Canadian Dollar',
  CHF: 'Swiss Franc', XAU: 'Gold', XAG: 'Silver', XPT: 'Platinum',
  XTI: 'WTI Crude', XBR: 'Brent Crude',
};

function classify(symbol: string): AssetClass {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const base = s.slice(0, 3);
  const quote = s.slice(3, 6);
  if (base === 'XAU' || base === 'XAG' || base === 'XPT') return 'metal';
  if (base === 'XTI' || base === 'XBR' || s.startsWith('OIL')) return 'commodity';
  if (s.length === 6 && CURRENCY[base] && CURRENCY[quote]) return 'fx';
  if (/^(VOL|US30|US50|NAS|SPX|GER|UK1|JP2|BOOM|CRASH|STEP)/.test(s)) return 'index';
  return 'other';
}

/**
 * "EURUSD" → "Euro / U.S. Dollar".
 *
 * For anything that is not a recognised pair, the broker's own full name is the
 * subtitle — "VOL25" sits above "Volatility 25 Index" — and a symbol with
 * neither gets no subtitle at all, rather than an invented one.
 */
function describe(symbol: string, alias: string): string {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const base = CURRENCY[s.slice(0, 3)];
  const quote = CURRENCY[s.slice(3, 6)];
  if (s.length === 6 && base && quote) return `${base} / ${quote}`;
  return symbol !== alias ? symbol : '';
}

interface Quote { bid: number | null; ask: number | null; spread: number | null; updated_at: string | null; pnl: number | null; state: string | null }

/* ── Indicators (computed client-side from the loaded candles) ─────────── */
type IndId = 'sma20' | 'sma50' | 'ema20' | 'boll';
const IND_META: { id: IndId; label: string; color: string; title: string }[] = [
  { id: 'sma20', label: 'MA20', color: '#f59e0b', title: 'Simple moving average (20)' },
  { id: 'sma50', label: 'MA50', color: '#a855f7', title: 'Simple moving average (50)' },
  { id: 'ema20', label: 'EMA20', color: '#06b6d4', title: 'Exponential moving average (20)' },
  { id: 'boll', label: 'BOLL', color: '#94a3b8', title: 'Bollinger Bands (20, 2σ)' },
];
type LinePt = { time: UTCTimestamp; value: number };

function sma(bars: Candle[], period: number): LinePt[] {
  const out: LinePt[] = [];
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close;
    if (i >= period) sum -= bars[i - period].close;
    if (i >= period - 1) out.push({ time: bars[i].time, value: sum / period });
  }
  return out;
}
function ema(bars: Candle[], period: number): LinePt[] {
  const out: LinePt[] = [];
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < bars.length; i++) {
    const c = bars[i].close;
    prev = i === 0 ? c : c * k + prev * (1 - k);
    if (i >= period - 1) out.push({ time: bars[i].time, value: prev });
  }
  return out;
}
function bollinger(bars: Candle[], period: number, mult: number): { upper: LinePt[]; mid: LinePt[]; lower: LinePt[] } {
  const upper: LinePt[] = [], mid: LinePt[] = [], lower: LinePt[] = [];
  for (let i = period - 1; i < bars.length; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += bars[j].close;
    const m = s / period;
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) { const d = bars[j].close - m; v += d * d; }
    const sd = Math.sqrt(v / period);
    const t = bars[i].time;
    mid.push({ time: t, value: m });
    upper.push({ time: t, value: m + mult * sd });
    lower.push({ time: t, value: m - mult * sd });
  }
  return { upper, mid, lower };
}

/** Candle colours. Canvas cannot read CSS custom properties, so the palette
 *  is passed in rather than inherited — the bot desk keeps its greens, the AI
 *  workspace wears emerald. */
export interface ChartPalette { up: string; down: string; text: string }

const DESK_PALETTE: ChartPalette = { up: '#22c55e', down: '#ef4444', text: '#98A2B3' };

export function MarketChart({
  markets, openTrades = [], showGrid = true, palette = DESK_PALETTE, focusSymbol = null,
  chrome = 'desk',
}: {
  markets: { symbol: string; alias: string }[];
  openTrades?: { symbol: string; side: string }[];
  /** Grid lines. Optional and on by default, so the bot dashboard is
   *  unchanged; the AI workspace drives it from its Chart panel. */
  showGrid?: boolean;
  palette?: ChartPalette;
  /** Market the surrounding page has selected — the chart follows it. Optional:
   *  left null, the picker below the chart stays the only thing that moves it,
   *  which is how the bot dashboard uses this. */
  focusSymbol?: string | null;
  /** 'desk' — the dashboard's controls above a fixed-height card, unchanged.
   *  'workspace' — fills its container with the trading-desk chrome: top bar,
   *  vertical tool rail, status strip, and the symbol search. */
  chrome?: 'desk' | 'workspace';
}) {
  // A market's label reads "Alias — SYMBOL", but when the alias IS the symbol
  // (e.g. NZDUSD) that renders as "NZDUSD — NZDUSD". Show it once in that case.
  const label = (sym: string) => {
    const m = markets.find((x) => x.symbol === sym);
    const a = m?.alias;
    return a && a !== sym ? `${a} — ${sym}` : sym;
  };
  // Symbols that currently hold an open trade (deduped), with a side for the dot.
  const openBySymbol = new Map<string, string>();
  for (const t of openTrades) if (!openBySymbol.has(t.symbol)) openBySymbol.set(t.symbol, t.side);

  // The first market on BOTH the server and the first client render. The saved
  // market is restored in an effect below, after hydration — reading
  // localStorage in the initialiser made the server render "AUDUSD" and the
  // browser render whatever you last looked at, which is a hydration mismatch
  // and exactly the "1 Issue" the dev overlay kept reporting.
  const [symbol, setSymbol] = useState(() => markets[0]?.symbol ?? '');
  const [tf, setTf] = useState<string>('M15');

  // Restore the last-viewed market + timeframe so a refresh keeps your place.
  // setState in an effect is the point here: this reads an external store
  // (localStorage) that does not exist during SSR.
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (s.symbol && markets.some((m) => m.symbol === s.symbol)) setSymbol(s.symbol as string);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (s.tf && TF_VALUES.includes(s.tf)) setTf(s.tf as string);
    } catch { /* ignore */ }
    // Once, on mount. Re-running on `markets` would undo a later pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tapping a market anywhere in the workspace brings the chart with it —
  // otherwise you read one market's reasons beside another market's candles.
  //
  // Adjusted during render, not in an effect (the documented pattern for
  // "state that follows a prop"): applied once per CHANGE of focus, so the
  // parent rebuilding its markets array on every render cannot snap the chart
  // back and undo a pick made here. Guarded on membership so a stale symbol
  // cannot blank the chart.
  const [appliedFocus, setAppliedFocus] = useState<string | null>(null);
  if (focusSymbol && focusSymbol !== appliedFocus) {
    setAppliedFocus(focusSymbol);
    if (markets.some((m) => m.symbol === focusSymbol)) setSymbol(focusSymbol);
  }

  const [searchOpen, setSearchOpen] = useState(false);
  const [drawOpen, setDrawOpen] = useState(false);
  /* Whether a two-click tool is half-way through.
   *
   * State, not the trendStart ref the click handler uses: a ref changing does
   * not re-render, so the banner would never update from "click the first
   * point" to "click the second" — which is exactly the missing feedback that
   * made the tools look dead. */
  const [drawPending, setDrawPending] = useState(false);
  const [railHidden, setRailHidden] = useState(false);
  /* The line type the rail button arms when you just click it.
   *
   * TradingView's behaviour, and the reason it feels quick: the button is the
   * tool you last used, not a menu you have to walk through every time. The
   * chevron under it opens the list to change which one that is. */
  const [lastLine, setLastLine] = useState<Tool>('hline');
  /** OHLC of the bar under the crosshair — null when the cursor is off-chart. */
  const [hoverBar, setHoverBar] = useState<
    { open: number; high: number; low: number; close: number } | null
  >(null);
  /** The newest bar, so the legend reads the live candle when nothing is
   *  hovered. State rather than reading barsRef in render: a ref read during
   *  render is empty on the first paint, so the strip would start blank and
   *  only appear once something else happened to re-render. */
  const [lastBar, setLastBar] = useState<
    { open: number; high: number; low: number; close: number } | null
  >(null);

  // The Chart panel's switch and the rail's button are two switches on one
  // light: null means "nobody has touched the rail, follow the prop", and
  // whichever was used last wins. Derived, so there is no prop→state effect.
  const [gridOverride, setGridOverride] = useState<boolean | null>(null);
  const gridOn = gridOverride ?? showGrid;
  const setGridOn = (next: boolean | ((v: boolean) => boolean)) =>
    setGridOverride((prev) => (typeof next === 'function' ? next(prev ?? showGrid) : next));
  const [drawingsHidden, setDrawingsHidden] = useState(false);
  const [drawingsLocked, setDrawingsLocked] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [indFavs, setIndFavs] = useState<string[]>([]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setIndFavs(JSON.parse(localStorage.getItem(IND_FAV_KEY) || '[]') as string[]); } catch { /* ignore */ }
  }, []);
  const toggleIndFav = (id: string) => {
    setIndFavs((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { localStorage.setItem(IND_FAV_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  const lockedRef = useRef(false);
  useEffect(() => { lockedRef.current = drawingsLocked; }, [drawingsLocked]);
  const [digits, setDigits] = useState(5);
  /* The click and range handlers are subscribed once, so they hold the FIRST
   * render's syncLabels and would format every readout at the initial 5 dp
   * whatever the symbol turned out to need. A ref is read when it is used. */
  const digitsRef = useRef(5);
  useEffect(() => { digitsRef.current = digits; }, [digits]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [hasHistory, setHasHistory] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const [tool, setTool] = useState<Tool>('cursor');
  /** The armed tool's menu entry — its name and how many clicks it wants.
   *  Declared here, below `tool`: it was above, which is a temporal dead zone
   *  and took the whole page down with "Cannot access 'tool' before
   *  initialization". */
  const armed = [...LINE_TOOLS, ...PITCHFORK_TOOLS, ...EXTRA_TOOLS].find((t) => t.tool === tool);
  const [fs, setFs] = useState(false);
  const [inds, setInds] = useState<Set<IndId>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(INDS_KEY);
        if (raw) return new Set(JSON.parse(raw) as IndId[]);
      } catch { /* ignore */ }
    }
    return new Set();
  });

  const cardRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const liveBar = useRef<Candle | null>(null);
  const overlayLines = useRef<IPriceLine[]>([]);          // entry / SL / TP (open or pending)
  const tradeSL = useRef<number | null>(null);
  const tradeTP = useRef<number | null>(null);
  const markersApi = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const activeSide = useRef<'buy' | 'sell' | null>(null); // side of the open trade, for the live P&L line
  // Drawings (manual annotations) — data is the source of truth, chart objects are
  // rebuilt from it and dragged in place.
  const toolRef = useRef<Tool>('cursor');
  const drawings = useRef<Drawing[]>([]);
  const hlineObjs = useRef<Map<string, IPriceLine>>(new Map());
  const trendObjs = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());
  const trendStart = useRef<{ time: Time; value: number } | null>(null);
  /** The pitchfork's clicks so far. Its own ref rather than reusing trendStart,
   *  which holds one point: this needs two before the third completes it. */
  const forkPts = useRef<{ time: Time; value: number }[]>([]);
  /** The rubber band, in pane pixels. `flat` means a level rather than a line,
   *  so it is drawn edge to edge at one height. Mirrored into a ref because the
   *  pointer handler is registered once and cannot read state. */
  const [band, setBand] = useState<
    { x1: number; y1: number; x2: number; y2: number; flat: boolean } | null
  >(null);
  const bandRef = useRef<typeof band>(null);
  const clearPreview = () => {
    bandRef.current = null; setBand(null);
    ghostRef.current = []; setGhostState([]);
  };

  /* THE SELECTED DRAWING — what the style toolbar acts on.
   *
   * Set when you place one (so it can be styled immediately, without hunting
   * for it again) and when you click an existing one with the crosshair. */
  /* The drawing itself, not its id. Derived-from-a-ref was the obvious shape
   * and the wrong one: the drawings live in a ref, so reading them during
   * render gives React no reason to re-render when they change — the toolbar
   * would show stale values after every edit. */
  const [selected, setSelected] = useState<Drawing | null>(null);
  const selectedRef = useRef<Drawing | null>(null);

  /** Where each diagonal's label sits, in pane pixels. Recomputed whenever the
   *  chart moves, because the line's midpoint moves with it. */
  const [lineLabels, setLineLabels] = useState<
    { id: string; x: number; y: number; text: string; color: string }[]
  >([]);
  /** The ringed dots at the points you actually clicked. */
  const [handles, setHandles] = useState<{ id: string; x: number; y: number }[]>([]);
  /* EVERY DIAGONAL, IN PIXELS.
   *
   * These were LineSeries, and that was the wrong tool. A series is DATA, so
   * extending a ray meant adding a far-future point, which grew the time
   * scale, which fired a range change, which extended it further — a loop
   * that either ran away or left the ray stopping in mid-air. It also could
   * not survive two clicks on one bar (duplicate times are rejected).
   *
   * Pixels have none of those problems: a line to the edge of the pane is a
   * line to the edge of the pane. Levels stay as price lines, because those
   * genuinely belong on the price axis and earn its badge. */
  const [segs, setSegs] = useState<{
    id: string; x1: number; y1: number; x2: number; y2: number;
    color: string; width: number; dash: string;
  }[]>([]);
  /** The same segments, readable from the pointer handlers. Those run outside
   *  React's render, so they cannot see `segs` state — and hit-testing a fork
   *  against anything other than what is drawn is how a line you can see stops
   *  being a line you can grab. */
  const segsRef = useRef<typeof segs>([]);

  /** The fork being placed, previewed in full. Separate from the rubber band:
   *  that is one line, and a fork is four. */
  const [ghost, setGhostState] = useState<Seg[]>([]);
  const ghostRef = useRef<Seg[]>([]);
  const setGhost = (v: Seg[]) => { ghostRef.current = v; setGhostState(v); };

  /** The visible time window, for extending rays to the pane's edge. */
  const viewRange = (): { from: number; to: number } | null => {
    const r = chartRef.current?.timeScale().getVisibleRange();
    return r ? { from: r.from as number, to: r.to as number } : null;
  };

  const syncLabels = () => {
    const s = seriesRef.current, c = chartRef.current;
    if (!s || !c) { setLineLabels([]); segsRef.current = []; setSegs([]); setHandles([]); return; }

    const W = wrapRef.current?.clientWidth ?? 0;
    const H = wrapRef.current?.clientHeight ?? 0;
    const xAt = (t: number): number | null => {
      const bars = barsRef.current;
      const L = timeToLogical(bars, inferBarSecs(bars), t);
      if (L === null) return null;
      const x = c.timeScale().logicalToCoordinate(L as Logical);
      return x === null ? null : Number(x);
    };

    /* Each diagonal, as pane coordinates.
     *
     * A ray is the anchor plus the direction of the second click, walked to
     * whichever edge that direction leads to. An extended line is walked both
     * ways. Because this is pixels, "the edge" is literally the edge — it
     * cannot fall short, and it adds nothing to the chart's data. */
    const out: typeof segs = [];
    for (const d of drawings.current) {
      if (d.kind !== 'trend') continue;
      const ax = xAt(d.t1);
      const ay = s.priceToCoordinate(d.v1);
      const bx = xAt(d.t2);
      const by = s.priceToCoordinate(d.v2);
      if (ax == null || ay == null || bx == null || by == null) continue;

      let x1 = ax as number, y1 = ay as number, x2 = bx as number, y2 = by as number;
      const reach = d.reach ?? 'segment';
      if (reach === 'hray') {
        // Flat, from the click to the right-hand edge.
        x2 = W; y2 = y1;
      } else if (reach !== 'segment') {
        const dx = x2 - x1, dy = y2 - y1;
        if (dx !== 0 || dy !== 0) {
          // Walk far enough that the end is always off-screen, then let the
          // SVG clip it. Simpler and steadier than solving for each edge.
          const far = (W + H) * 2;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len, uy = dy / len;
          x2 = x1 + ux * far; y2 = y1 + uy * far;
          if (reach === 'extended') { x1 -= ux * far; y1 -= uy * far; }
        }
      }
      out.push({
        id: d.id, x1, y1, x2, y2,
        color: d.color ?? DRAW_COLOR,
        width: d.width ?? 2,
        dash: d.style === 'dashed' ? '6 4' : d.style === 'dotted' ? '2 3' : '',
      });
    }
    /* THE FORK, derived here rather than stored.
     *
     * Median: p1 through the midpoint of p2-p3. Tines: p2 and p3, each parallel
     * to it. All three are walked to the right-hand edge from their own anchor,
     * so the fork opens forward in time the way it is read — a pitchfork that
     * ran backwards over the swing that defined it would be describing history
     * it already has.
     *
     * Done in PIXELS, like the rays above, because "parallel" has to mean
     * parallel on screen. Price and time have different units and a rescale
     * changes their ratio, so tines computed in price space would splay apart
     * the moment the axis moved. */
    for (const d of drawings.current) {
      if (d.kind !== 'pitchfork') continue;
      const pt = (t: number, v: number) => {
        const x = xAt(t);
        const y = s.priceToCoordinate(v);
        return x == null || y == null ? null : { x: x as number, y: y as number };
      };
      const p1 = pt(d.t1, d.v1), p2 = pt(d.t2, d.v2), p3 = pt(d.t3, d.v3);
      if (!p1 || !p2 || !p3) continue;
      out.push(...forkSegments(p1, p2, p3, d.id, {
        color: d.color ?? DRAW_COLOR,
        width: d.width ?? 2,
        dash: d.style === 'dashed' ? '6 4' : d.style === 'dotted' ? '2 3' : '',
      }, W, H));
    }

    /* VERTICAL LINE and CROSS LINE.
     *
     * Both run the full height (and the cross the full width) of the pane, so
     * only the anchored axis is measured — the other end is the edge. The
     * vertical is anchored in TIME alone, which is why it has no price: it
     * marks a moment, and a moment has no height. */
    for (const d of drawings.current) {
      if (d.kind !== 'vline' && d.kind !== 'cross') continue;
      const cx = xAt(d.t1);
      if (cx == null) continue;
      const color = d.color ?? DRAW_COLOR;
      const width = d.width ?? 2;
      const dash = d.style === 'dashed' ? '6 4' : d.style === 'dotted' ? '2 3' : '';
      // The vertical takes the drawing's own id so the label pass lands on it.
      out.push({ id: d.id, x1: cx as number, y1: 0, x2: cx as number, y2: H, color, width, dash });
      if (d.kind === 'cross') {
        const cy = s.priceToCoordinate(d.v1);
        if (cy != null) {
          out.push({
            id: `${d.id}#h`, x1: 0, y1: cy as number, x2: W, y2: cy as number,
            color, width, dash,
          });
        }
      }
    }

    segsRef.current = out;
    setSegs(out);

    // Labels: at the midpoint of the drawn line, so a ray's label sits along
    // what you can see rather than halfway to an off-screen end.
    const labels: { id: string; x: number; y: number; text: string; color: string }[] = [];
    for (const g of out) {
      const d = drawings.current.find((k) => k.id === g.id);
      if (!d || d.kind === 'hline') continue;
      /* THE READOUT, worked out here rather than stored.
       *
       * Info reports what the line spans: the price move, the same as a
       * percentage, and how many bars it took. Angle reports its slope in
       * degrees. Both are properties of where the ends currently are, so
       * computing them at render is what keeps them true after a drag —
       * a stored string would still describe where the line used to be.
       *
       * The angle is measured in PIXELS on purpose. An angle in price-over-
       * time has no meaning you can see, because the axes have different
       * units and a rescale would change the number without the line moving. */
      let text = d.label ?? '';
      if (d.kind === 'trend' && d.readout) {
        const dv = d.v2 - d.v1;
        const pct = d.v1 !== 0 ? (dv / Math.abs(d.v1)) * 100 : 0;
        if (d.readout === 'angle') {
          const deg = -Math.atan2(g.y2 - g.y1, g.x2 - g.x1) * (180 / Math.PI);
          text = `${deg >= 0 ? '+' : ''}${deg.toFixed(1)}°`;
        } else {
          const step = barStepSecs();
          const bars = step > 0 ? Math.abs(Math.round((d.t2 - d.t1) / step)) : 0;
          text = `${dv >= 0 ? '+' : ''}${fmt(dv, digitsRef.current)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`
            + (bars ? ` · ${bars} bar${bars === 1 ? '' : 's'}` : '');
        }
        if (d.label) text = `${d.label} · ${text}`;
      }
      if (!text) continue;
      labels.push({
        id: d.id,
        x: (Math.max(0, Math.min(W, g.x1)) + Math.max(0, Math.min(W, g.x2))) / 2,
        y: (Math.max(0, Math.min(H, g.y1)) + Math.max(0, Math.min(H, g.y2))) / 2,
        text,
        color: g.color,
      });
    }
    setLineLabels(labels);

    /* HANDLES. Drawn as an overlay rather than with the series' own point
     * markers, because a ray's far end is a computed edge point, not
     * something you placed — a handle there would invite you to drag a thing
     * that is not a handle. So: the clicked points only. */
    const hs: { id: string; x: number; y: number }[] = [];
    for (const d of drawings.current) {
      if (d.kind !== 'trend') continue;
      if (d.id !== selectedRef.current?.id) continue;
      const reach = d.reach ?? 'segment';
      const x1 = xAt(d.t1);
      const y1 = s.priceToCoordinate(d.v1);
      if (x1 != null && y1 != null) hs.push({ id: `${d.id}:a`, x: x1 as number, y: y1 as number });
      // The second click is a real point on a segment; on a ray or an extended
      // line it only set the direction.
      if (reach === 'segment') {
        const x2 = xAt(d.t2);
        const y2 = s.priceToCoordinate(d.v2);
        if (x2 != null && y2 != null) hs.push({ id: `${d.id}:b`, x: x2 as number, y: y2 as number });
      }
    }
    /* All three of a fork's points are real clicks, so all three get a handle —
     * unlike a ray, whose far end is a computed edge. */
    for (const d of drawings.current) {
      if (d.kind !== 'pitchfork') continue;
      if (d.id !== selectedRef.current?.id) continue;
      const pts:[number, number, string][] = [
        [d.t1, d.v1, 'a'], [d.t2, d.v2, 'b'], [d.t3, d.v3, 'c'],
      ];
      for (const [t, v, key] of pts) {
        const x = xAt(t);
        const y = s.priceToCoordinate(v);
        if (x != null && y != null) hs.push({ id: `${d.id}:${key}`, x: x as number, y: y as number });
      }
    }
    setHandles(hs);
  };

  /** Patch one drawing, redraw it, and save. Redrawn rather than mutated in
   *  place because colour, width and style are creation options on a series —
   *  the library has no "change the style of this line" call for all of them. */
  const patchDrawing = (id: string, patch: Partial<Drawing>) => {
    const i = drawings.current.findIndex((d) => d.id === id);
    if (i < 0) return;
    const next = { ...drawings.current[i], ...patch } as Drawing;
    drawings.current[i] = next;

    /* APPLIED IN PLACE, not by rebuilding.
     *
     * This called renderDrawings(), which removes EVERY drawing and re-adds
     * them all — so anything that threw while re-adding one took the whole
     * set off the chart. Changing a colour made every line disappear.
     *
     * Colour, width and dash are all live options on a price line and on a
     * series, so none of that is necessary: set them on the object that is
     * already there. Nothing is removed, so nothing can fail to come back. */
    try {
      const col = next.color ?? DRAW_COLOR;
      if (next.kind === 'hline') {
        hlineObjs.current.get(id)?.applyOptions({
          color: col,
          lineWidth: (next.width ?? 2) as 1 | 2 | 3 | 4,
          lineStyle: lwStyle(next.style ?? 'dashed'),
          axisLabelColor: col,
          title: next.label ?? '',
        });
      }
      // A diagonal's colour, width and dash are SVG attributes, so re-measuring
      // the overlay is the whole update.
      syncLabels();
    } catch {
      // The object is missing (hidden, or a symbol change rebuilt the chart):
      // fall back to a full redraw, which is correct if slower.
      if (!drawingsHidden) renderDrawings();
    }

    persistDrawings();
    syncLabels();
    setSelected(next);            // so the toolbar shows what it just set
  };
  const deleteDrawing = (id: string) => {
    drawings.current = drawings.current.filter((d) => d.id !== id);
    setSelected(null);
    if (!drawingsHidden) renderDrawings();
    persistDrawings();
  };
  const duplicateDrawing = (id: string) => {
    const d = drawings.current.find((x) => x.id === id);
    if (!d) return;
    const copy = { ...d, id: newDrawId() } as Drawing;
    // Offset a little so the copy is visibly a second line, not one hiding
    // exactly underneath the original.
    if (copy.kind === 'hline') copy.price *= 1.0005;
    // A vertical has no price to nudge, so the copy steps sideways by a bar —
    // nudging nothing would stack it exactly on the original.
    else if (copy.kind === 'vline') copy.t1 += barStepSecs();
    else {
      copy.v1 *= 1.0005;
      if (copy.kind === 'trend' || copy.kind === 'pitchfork') copy.v2 *= 1.0005;
      if (copy.kind === 'pitchfork') copy.v3 *= 1.0005;
    }
    drawings.current.push(copy);
    if (!drawingsHidden) renderDrawings();
    persistDrawings();
    setSelected(copy);
  };

  /* Alt+T / Alt+H / Alt+L, and Escape to put the crosshair back.
   *
   * Alt, not a bare letter: this chart shares the page with a symbol search
   * and a label prompt, and a bare "t" would arm a tool mid-sentence. Skipped
   * entirely while focus is in a field, because Alt+T typed into a text box
   * was meant for the text box.
   *
   * Escape also drops a half-finished two-click line, so an accidental first
   * click is not left waiting for a second one you never meant to give. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') {
        setTool('cursor');
        trendStart.current = null;
        forkPts.current = [];
        setDrawPending(false);
        clearPreview();
        setDrawOpen(false);
        return;
      }
      if (!e.altKey) return;
      const hit = LINE_TOOLS.find((t) => t.keys?.toLowerCase() === `alt+${e.key.toLowerCase()}`);
      if (!hit) return;
      e.preventDefault();
      if (hit.tool) setTool(hit.tool);
      trendStart.current = null;
      forkPts.current = [];
      setDrawPending(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const drawKeyRef = useRef<string>('');                 // current symbol+tf storage key (read inside once-bound handlers)
  const drag = useRef<{ id: string; kind: 'hline' | 'trend'; lastX: number; lastY: number } | null>(null);
  // Indicators.
  const barsRef = useRef<Candle[]>([]);

  /** Seconds per bar, read off the loaded candles rather than parsed out of the
   *  timeframe label — the data is the authority on its own spacing. 0 when
   *  there are not two bars to measure between. */
  const barStepSecs = (): number => {
    const b = barsRef.current;
    if (b.length < 2) return 0;
    return (b[b.length - 1].time as number) - (b[b.length - 2].time as number);
  };
  const indsRef = useRef<Set<IndId>>(inds);
  const indSeries = useRef<ISeriesApi<'Line'>[]>([]);

  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { selectedRef.current = selected; syncLabels(); }, [selected]);

  const alias = markets.find((m) => m.symbol === symbol)?.alias ?? symbol;

  // ── Manual drawings: persist / render / clear ─────────────────────────
  // All of these use only refs, so the copies captured by the once-bound chart
  // handlers stay correct across re-renders.
  const persistDrawings = () => {
    try { if (drawKeyRef.current) localStorage.setItem(drawKeyRef.current, JSON.stringify(drawings.current)); } catch { /* ignore */ }
  };
  const addDrawingObject = (d: Drawing) => {
    const series = seriesRef.current, chart = chartRef.current;
    if (!series || !chart) return;
    if (d.kind === 'hline') {
      // Dashed, and in the drawing blue rather than grey: a level someone drew
      // has to be distinguishable at a glance from the bot's own SL/TP lines,
      // which are solid and take the up/down colours. The axis label carries
      // the exact price, which is the whole reason for drawing it.
      const col = d.color ?? DRAW_COLOR;
      hlineObjs.current.set(d.id, series.createPriceLine({
        price: d.price,
        color: col,
        lineWidth: (d.width ?? 2) as 1 | 2 | 3 | 4,
        lineStyle: lwStyle(d.style ?? 'dashed'),
        axisLabelVisible: true,
        axisLabelColor: col,
        axisLabelTextColor: '#ffffff',
        title: d.label ?? '',
      }));
    }
    // Diagonals are drawn by the SVG overlay — see syncLabels. Nothing to add
    // to the chart, which is the point: no data, no time-scale side effects.
  };
  const removeDrawingObjects = () => {
    hlineObjs.current.forEach((l) => seriesRef.current?.removePriceLine(l));
    hlineObjs.current.clear();
    trendObjs.current.forEach((s) => chartRef.current?.removeSeries(s));
    trendObjs.current.clear();
  };
  /** Per-drawing try/catch: one line the library refuses (duplicate times, a
   *  disposed series) must not take the other nine off the chart with it. */
  const renderDrawings = () => {
    removeDrawingObjects();
    for (const d of drawings.current) {
      try { addDrawingObject(d); } catch { /* skip this one, keep the rest */ }
    }
    syncLabels();
  };
  const loadDrawings = (sym: string, t: string): Drawing[] => {
    try { const raw = localStorage.getItem(DRAW_KEY(sym, t)); if (raw) return JSON.parse(raw) as Drawing[]; } catch { /* ignore */ }
    return [];
  };
  const clearDrawings = () => {
    removeDrawingObjects();
    drawings.current = [];
    trendStart.current = null;
    forkPts.current = [];
    persistDrawings();
    setSelected(null); clearPreview(); syncLabels();
    redoStack.current = [];
  };

  // Undo / redo, over the drawings only — the chart's pan and zoom are not
  // edits and nobody expects ⟲ to scroll them back. Redo is dropped the moment
  // a new line is drawn, which is what every editor does.
  const redoStack = useRef<Drawing[]>([]);
  const repaint = () => { if (!drawingsHidden) renderDrawings(); persistDrawings(); };
  const undoDrawing = () => {
    const d = drawings.current.pop();
    if (!d) return;
    redoStack.current.push(d);
    repaint();
  };
  const redoDrawing = () => {
    const d = redoStack.current.pop();
    if (!d) return;
    drawings.current.push(d);
    repaint();
  };

  // A picture of the chart as it stands, drawings and all. takeScreenshot()
  // returns the composited canvas, so what saves is what you are looking at.
  // ── The rest of the top bar ───────────────────────────────────────────
  // Trade overlays (entry / SL / TP price lines and the fill marker) are a
  // layer over the candles, so the layers icon is what hides them. They are
  // rebuilt by the loader, so hiding just strips them until the next load —
  // hence the ref the loader also reads.
  const [overlaysOn, setOverlaysOn] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);
  const toggleOverlays = () => {
    const next = !overlaysOn;
    setOverlaysOn(next);
    const series = seriesRef.current;
    if (!next && series) {
      overlayLines.current.forEach((l) => series.removePriceLine(l));
      overlayLines.current = [];
      markersApi.current?.setMarkers([]);
    } else if (next) {
      setReloadTick((t) => t + 1);
    }
  };

  // Favourites: the markets you actually watch, floated to the top of the
  // search. Per browser, like the drawings — nothing here is account state.
  const [favs, setFavs] = useState<string[]>([]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setFavs(JSON.parse(localStorage.getItem(FAV_KEY) || '[]') as string[]); } catch { /* ignore */ }
  }, []);
  const toggleFav = () => {
    setFavs((prev) => {
      const next = prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol];
      try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  /** The candles on screen, as CSV on the clipboard — the chart's data, out. */
  const copyCandles = async () => {
    const bars = barsRef.current;
    if (!bars.length) return;
    const rows = ['time,open,high,low,close']
      .concat(bars.map((b) => [
        new Date(((b.time as number) - new Date().getTimezoneOffset() * 60) * 1000).toISOString(),
        b.open, b.high, b.low, b.close,
      ].join(',')));
    try {
      await navigator.clipboard.writeText(rows.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked — nothing to recover */ }
  };
  const [copied, setCopied] = useState(false);

  /**
   * A picture of the whole panel, not just the candles.
   *
   * takeScreenshot() returns the chart's own canvas only — the top bar, rail
   * and status strip are DOM and never appear in it, so a raw save comes out a
   * nameless chart. Painting the same header and footer onto the exported
   * canvas gives an image that says what it is: which market, which timeframe,
   * the P&L, and when it was taken.
   */
  const saveScreenshot = () => {
    const shot = chartRef.current?.takeScreenshot();
    if (!shot) return;

    const HEAD = 44, FOOT = 28, PAD = 14;
    const out = document.createElement('canvas');
    out.width = shot.width;
    out.height = shot.height + HEAD + FOOT;
    const ctx = out.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0b0f0d';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(shot, 0, HEAD);
    ctx.textBaseline = 'middle';

    ctx.font = 'bold 16px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(alias, PAD, HEAD / 2);
    const w = ctx.measureText(alias).width;
    ctx.font = '13px ui-monospace, monospace';
    ctx.fillStyle = '#9AA0A6';
    ctx.fillText(tf, PAD + w + 12, HEAD / 2);

    if (quote?.pnl != null) {
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.fillStyle = Number(quote.pnl) >= 0 ? palette.up : palette.down;
      ctx.textAlign = 'right';
      ctx.fillText(
        `${Number(quote.pnl) >= 0 ? '+' : ''}${Number(quote.pnl).toFixed(2)}`,
        out.width - PAD, HEAD / 2,
      );
      ctx.textAlign = 'left';
    }

    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = '#6b7280';
    const footY = HEAD + shot.height + FOOT / 2;
    ctx.fillText(
      `${stale ? 'feed stale' : 'market open'} · ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`,
      PAD, footY,
    );
    ctx.textAlign = 'right';
    ctx.fillText('highscore.ai', out.width - PAD, footY);

    const a = document.createElement('a');
    a.href = out.toDataURL('image/png');
    a.download = `${alias}-${tf}-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  };

  // Draw the active indicators from the currently-loaded candles. Clear-then-draw
  // so it's idempotent: called both when the candles reload and when a toggle flips.
  const redrawIndicators = () => {
    const chart = chartRef.current;
    if (!chart) return;
    indSeries.current.forEach((s) => chart.removeSeries(s));
    indSeries.current = [];
    const bars = barsRef.current;
    if (!bars.length) return;
    const addLine = (data: LinePt[], color: string, dashed = false) => {
      const s = chart.addSeries(LineSeries, {
        color, lineWidth: dashed ? 1 : 2,
        lineStyle: dashed ? LineStyle.Dashed : LineStyle.Solid,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      });
      s.setData(data);
      indSeries.current.push(s);
    };
    for (const id of indsRef.current) {
      if (id === 'boll') {
        const { upper, mid, lower } = bollinger(bars, 20, 2);
        addLine(upper, '#94a3b8', true);
        addLine(mid, '#94a3b8', false);
        addLine(lower, '#94a3b8', true);
      } else if (id === 'sma20') {
        addLine(sma(bars, 20), '#f59e0b');
      } else if (id === 'sma50') {
        addLine(sma(bars, 50), '#a855f7');
      } else if (id === 'ema20') {
        addLine(ema(bars, 20), '#06b6d4');
      }
    }
  };

  const toggleInd = (id: IndId) => setInds((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  useEffect(() => {
    indsRef.current = inds;
    redrawIndicators();
    try { localStorage.setItem(INDS_KEY, JSON.stringify([...inds])); } catch { /* ignore */ }
  }, [inds]);

  // Fullscreen (native) on the chart card.
  const toggleFullscreen = () => {
    const el = cardRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen().catch(() => {});
  };
  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // Persist the selection.
  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ symbol, tf })); } catch { /* ignore */ }
  }, [symbol, tf]);

  // The grid toggles without rebuilding the chart — a rebuild would drop the
  // drawings and reset the view, which is not what "hide the grid" means.
  useEffect(() => {
    chartRef.current?.applyOptions({
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.05)', visible: gridOn },
        horzLines: { color: 'rgba(255,255,255,0.05)', visible: gridOn },
      },
    });
  }, [gridOn]);

  // The eye hides the drawings without deleting them: the objects come off the
  // chart, the list in `drawings` (and localStorage) is untouched, so showing
  // them again brings back exactly what was there. Deleting is the trash.
  useEffect(() => {
    if (!chartRef.current || !seriesRef.current) return;
    if (drawingsHidden) removeDrawingObjects();
    else renderDrawings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawingsHidden]);

  // ── Create the chart once ─────────────────────────────────────────────
  useEffect(() => {
    if (!wrapRef.current) return;
    const chart = createChart(wrapRef.current, {
      autoSize: true,
      // attributionLogo: lightweight-charts v5 paints a TradingView mark into
      // the bottom-left of the canvas by default. It sits on the candles and
      // reads as this desk being a TradingView screen, which it is not.
      layout: {
        background: { color: 'transparent' },
        textColor: palette.text,
        fontFamily: 'inherit',
        attributionLogo: false,
      },
      // Created visible; the effect above applies the current setting on
      // mount. Reading the prop here would make the chart depend on it and
      // rebuild — dropping every drawing — each time the grid is toggled.
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.05)', visible: true },
        horzLines: { color: 'rgba(255,255,255,0.05)', visible: true },
      },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.1)', timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: palette.up, downColor: palette.down, wickUpColor: palette.up, wickDownColor: palette.down,
      borderVisible: false,
    });
    chartRef.current = chart;
    seriesRef.current = series;

    // Drawing: a click places a horizontal line at the price, or the two ends of
    // a trend line. Reads the current tool from a ref so we subscribe only once.
    /* THE TIME UNDER A CLICK — including past the last candle.
     *
     * param.time is set only when the click lands ON a bar. Click the gap to
     * the right of the newest candle, which is exactly where you point a fork
     * or a ray, and it is undefined — so the handler below used to bail and
     * the click vanished. The preview already solved this in pixels and said
     * so in its own comment; the click path never got the same treatment, and
     * a tool that drops half your clicks reads as a tool that does nothing.
     *
     * Past the last bar there is no bar to ask, so the time is extrapolated
     * from the last two: their spacing is the timeframe, and barSpacing is how
     * wide a bar is on screen. That keeps the anchor a real timestamp rather
     * than a pixel, which is what lets it survive a zoom. */
    const timeAtX = (x: number): number | null => {
      const bars = barsRef.current;
      const L = chart.timeScale().coordinateToLogical(x);
      return L === null ? null : logicalToTime(bars, inferBarSecs(bars), Math.round(L));
    };
    /** Pane x of a stored time, through the bar slots (see bar-time.ts). */
    const xAt = (t: number): number | null => {
      const bars = barsRef.current;
      const L = timeToLogical(bars, inferBarSecs(bars), t);
      if (L === null) return null;
      const x = chart.timeScale().logicalToCoordinate(L as Logical);
      return x === null ? null : Number(x);
    };

    const onClick = (param: MouseEventParams) => {
      const t = toolRef.current;
      // Cursor is a plain crosshair now; SL/TP overlays are always drawn.
      if (t === 'cursor') return;
      if (!param.point) return;
      const price = series.coordinateToPrice(param.point.y);
      if (price == null) return;
      const time = (param.time as number | undefined) ?? timeAtX(param.point.x);
      if (time == null) return;
      if (t === 'hline') {
        const d: Drawing = { id: newDrawId(), kind: 'hline', price };
        drawings.current.push(d); addDrawingObject(d); persistDrawings(); setSelected(d);
        setTool('cursor');
        clearPreview();
      } else if (t === 'hray') {
        // One click. A horizontal RAY differs from a horizontal LINE in where
        // it starts: the line spans all of history, this one applies from the
        // moment you clicked — which is the honest way to mark a level that
        // was not there before an event.
        const d: Drawing = {
          id: newDrawId(), kind: 'trend', reach: 'hray',
          t1: time, v1: price, t2: time, v2: price,
        };
        drawings.current.push(d); addDrawingObject(d); persistDrawings(); setSelected(d);
        setTool('cursor');
        syncLabels();           // a horizontal ray is a diagonal too — same overlay
      } else if (t === 'vline' || t === 'cross') {
        // One click each. A vertical line marks WHEN and takes no price; a
        // cross marks when AND what, so it keeps both.
        const d: Drawing = t === 'vline'
          ? { id: newDrawId(), kind: 'vline', t1: time }
          : { id: newDrawId(), kind: 'cross', t1: time, v1: price };
        drawings.current.push(d); addDrawingObject(d); persistDrawings(); setSelected(d);
        setTool('cursor');
        clearPreview();
        syncLabels();
      } else if (t === 'trend' || t === 'ray' || t === 'extended' || t === 'info' || t === 'angle') {
        // Two clicks. The first is remembered; the second completes it.
        if (!trendStart.current) {
          trendStart.current = { time: time as Time, value: price };
          setDrawPending(true);
          return;
        }
        const d: Drawing = {
          id: newDrawId(), kind: 'trend',
          // Info and Angle are segments: they measure the span you drew, so
          // running on past it would be reporting on something you did not mark.
          reach: t === 'ray' || t === 'extended' ? t : 'segment',
          ...(t === 'info' || t === 'angle' ? { readout: t } : {}),
          t1: trendStart.current.time as number, v1: trendStart.current.value,
          t2: time, v2: price,
        };
        drawings.current.push(d); addDrawingObject(d); persistDrawings(); setSelected(d);
        setTool('cursor');
        trendStart.current = null;
        setDrawPending(false);
        clearPreview();
        syncLabels();           // see the pitchfork branch — the overlay needs measuring
      } else if (t === 'pitchfork') {
        // Three clicks: pivot, then the two ends of the swing off it. The first
        // two are only remembered — nothing is drawn until the third, because
        // two points do not yet describe a fork.
        forkPts.current.push({ time: time as Time, value: price });
        if (forkPts.current.length < 3) { setDrawPending(true); return; }
        const [a, b, c3] = forkPts.current;
        const d: Drawing = {
          id: newDrawId(), kind: 'pitchfork',
          t1: a.time as number, v1: a.value,
          t2: b.time as number, v2: b.value,
          t3: c3.time as number, v3: c3.value,
        };
        drawings.current.push(d); addDrawingObject(d); persistDrawings(); setSelected(d);
        setTool('cursor');
        forkPts.current = [];
        setDrawPending(false);
        clearPreview();
        // Diagonals live in the SVG overlay, and the overlay is only rebuilt by
        // syncLabels. Without this the fork is in `drawings` but nothing has
        // measured it yet, so it stays invisible until a pan or zoom happens to
        // trigger a re-measure — which reads as the tool not working.
        syncLabels();
      } else if (t === 'text') {
        // A labelled level. Cancelling the prompt places nothing — an empty
        // label would just be a plain line the text tool pretended to name.
        const label = window.prompt('Label for this level');
        if (label == null || !label.trim()) return;
        const d: Drawing = { id: newDrawId(), kind: 'hline', price, label: label.trim() };
        drawings.current.push(d); addDrawingObject(d); persistDrawings(); setSelected(d);
        setTool('cursor');
      }
    };
    chart.subscribeClick(onClick);

    /* THE BAR UNDER THE CURSOR.
     *
     * Open, high, low, close and the change across that one candle. Every
     * other number on this desk is about the account; this is the only place
     * that answers "what did THIS bar actually do", which is the question you
     * are asking whenever you put the crosshair on one.
     *
     * Falls back to the last bar when the cursor leaves the chart, so the
     * strip reads the current candle rather than emptying. */
    const onCrosshair = (param: MouseEventParams) => {
      const d = param.seriesData.get(series) as
        | { open: number; high: number; low: number; close: number } | undefined;
      setHoverBar(d ?? null);

      // The rubber-band preview is an SVG overlay now, not a chart series:
      // see the pointermove handler below.
    };
    chart.subscribeCrosshairMove(onCrosshair);

    // A label sits at its line's midpoint in PIXELS, so panning or zooming
    // moves it. Re-measured whenever the visible range changes.
    const onRange = () => syncLabels();
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);

    // ── Drag-to-move a drawing (cursor tool only) ─────────────────────────
    // Grab a line by clicking within a few px of it, then drag. While dragging we
    // freeze the chart's own pan/zoom so the move doesn't scroll the candles.
    const el = wrapRef.current;
    const HIT = 7; // px proximity to grab a line
    const localXY = (e: PointerEvent) => {
      const r = el!.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const hitTest = (x: number, y: number): { id: string; kind: 'hline' | 'trend' } | null => {
      const s = seriesRef.current, c = chartRef.current;
      if (!s || !c) return null;
      for (const d of drawings.current) {
        if (d.kind !== 'hline') continue;
        const cy = s.priceToCoordinate(d.price);
        if (cy != null && Math.abs(cy - y) <= HIT) return { id: d.id, kind: 'hline' };
      }
      for (const d of drawings.current) {
        if (d.kind !== 'trend' || d.reach === 'hray') continue;
        const x1 = xAt(d.t1);
        const x2 = xAt(d.t2);
        const y1 = s.priceToCoordinate(d.v1), y2 = s.priceToCoordinate(d.v2);
        if (x1 == null || x2 == null || y1 == null || y2 == null) continue;
        if (distToSeg(x, y, x1, y1, x2, y2) <= HIT) return { id: d.id, kind: 'trend' };
      }
      /* A fork is grabbed by any of its lines. Tested against what is ON SCREEN
       * — the segments syncLabels already computed — rather than re-deriving
       * the geometry here, so the thing you can see and the thing you can grab
       * cannot disagree. */
      for (const d of drawings.current) {
        if (d.kind !== 'pitchfork' && d.kind !== 'vline' && d.kind !== 'cross'
          && !(d.kind === 'trend' && d.reach === 'hray')) continue;
        const mine = segsRef.current.filter(
          (g) => g.id === d.id || g.id.startsWith(`${d.id}#`),
        );
        for (const g of mine) {
          if (distToSeg(x, y, g.x1, g.y1, g.x2, g.y2) <= HIT) {
            return { id: d.id, kind: 'trend' };
          }
        }
      }
      return null;
    };
    const onDown = (e: PointerEvent) => {
      if (toolRef.current !== 'cursor') return;
      // Locked: the lines stay where they are. Without this, a pan that starts
      // near a level silently drags the level instead of the chart.
      if (lockedRef.current) return;
      const { x, y } = localXY(e);
      const hit = hitTest(x, y);
      // Clicking a line selects it — that is how the style toolbar knows what
      // to act on. Clicking empty space clears the selection, so the toolbar
      // goes away rather than hovering over nothing.
      setSelected(hit ? drawings.current.find((k) => k.id === hit.id) ?? null : null);
      if (!hit) return;                       // nothing grabbed → let the chart pan
      e.preventDefault();
      drag.current = { id: hit.id, kind: hit.kind, lastX: x, lastY: y };
      chart.applyOptions({ handleScroll: false, handleScale: false });
      try { el!.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    };
    const onMove = (e: PointerEvent) => {
      const s = seriesRef.current, c = chartRef.current;
      if (!s || !c) return;
      const { x, y } = localXY(e);

      /* THE RUBBER BAND, IN PIXELS.
       *
       * This was a chart series driven by the crosshair event, and it kept not
       * drawing: that path needs the time scale to resolve the cursor to a bar,
       * which returns nothing while data is loading, in the gap right of the
       * last candle, or when both ends land on one bar. Three different silent
       * failures, all of which look identical — a tool that ignores you.
       *
       * Pixels always resolve. The anchor is converted to screen coordinates
       * each frame, so the band tracks the cursor whatever the chart is doing. */
      const t = toolRef.current;
      if (t === 'cursor') {
        if (bandRef.current) { bandRef.current = null; setBand(null); }
      } else {
        const st = trendStart.current;
        const twoClick = t === 'trend' || t === 'ray' || t === 'extended'
          || t === 'info' || t === 'angle';
        const W0 = wrapRef.current?.clientWidth ?? 0;
        const H0 = wrapRef.current?.clientHeight ?? 0;
        /* A FORK IN PROGRESS previews from its last click to the cursor.
         *
         * It fell through to the level preview below, so arming a three-click
         * tool drew a flat line across the pane — a preview of a drawing you
         * were not making. Before the first click there is nothing to draw
         * from, so it previews nothing rather than something wrong. */
        if (t === 'vline' || t === 'cross') {
          /* Previewed as the lines themselves, at the cursor. The flat band
           * below would have shown a horizontal line for both — right for half
           * of a cross and wrong for a vertical. */
          const style = { color: DRAW_COLOR, width: 2, dash: '' };
          const g: Seg[] = [{ id: 'ghost-v', x1: x, y1: 0, x2: x, y2: H0, ...style }];
          if (t === 'cross') g.push({ id: 'ghost-h', x1: 0, y1: y, x2: W0, y2: y, ...style });
          setGhost(g);
          if (bandRef.current) { bandRef.current = null; setBand(null); }
        } else if (t === 'pitchfork') {
          const px = (p: { time: Time; value: number }): Pt | null => {
            const ax = xAt(p.time as number);
            const ay = s.priceToCoordinate(p.value);
            return ax == null || ay == null ? null : { x: ax, y: ay as number };
          };
          const pts = forkPts.current;
          if (pts.length === 2) {
            /* TWO DOWN: preview the WHOLE fork, with the cursor as the third
             * point. A single rubber band would show one line and then produce
             * four — the preview has to be the drawing, which is why this calls
             * the same forkSegments the committed one does. */
            const a = px(pts[0]), b = px(pts[1]);
            const W = wrapRef.current?.clientWidth ?? 0;
            const H = wrapRef.current?.clientHeight ?? 0;
            setGhost(a && b
              ? forkSegments(a, b, { x, y }, 'ghost',
                  { color: DRAW_COLOR, width: 2, dash: '' }, W, H)
              : []);
            if (bandRef.current) { bandRef.current = null; setBand(null); }
          } else if (pts.length === 1) {
            // One down: the base is all that exists yet, so show just that.
            if (ghostRef.current.length) setGhost([]);
            const a = px(pts[0]);
            const next = a ? { x1: a.x, y1: a.y, x2: x, y2: y, flat: false } : null;
            bandRef.current = next;
            setBand(next);
          } else {
            if (ghostRef.current.length) setGhost([]);
            if (bandRef.current) { bandRef.current = null; setBand(null); }
          }
        } else if (twoClick && st) {
          const ax = xAt(st.time as number);
          const ay = s.priceToCoordinate(st.value);
          const next = ax != null && ay != null
            ? { x1: ax, y1: ay as number, x2: x, y2: y, flat: false }
            : null;
          bandRef.current = next;
          setBand(next);
        } else if (!twoClick) {
          // A level: horizontal, at the cursor's height, across the pane.
          const next = { x1: 0, y1: y, x2: 0, y2: y, flat: true };
          bandRef.current = next;
          setBand(next);
        }
      }

      const dg = drag.current;
      if (!dg) {
        if (toolRef.current === 'cursor') el!.style.cursor = hitTest(x, y) ? 'grab' : '';
        return;
      }
      const d = drawings.current.find((k) => k.id === dg.id);
      if (!d) return;
      if (d.kind === 'hline') {
        const p = s.coordinateToPrice(y);
        if (p == null) return;
        d.price = p;
        hlineObjs.current.get(d.id)?.applyOptions({ price: p });
      } else {
        /* EVERY anchor the drawing has, not the first two.
         *
         * This moved v1/v2 and t1/t2 only, which is the whole of a trend line
         * and two thirds of a pitchfork — dragging one warped it, because its
         * third point stayed behind while the other two moved out from under
         * it. Moving a drawing must not reshape it. */
        const pNow = s.coordinateToPrice(y), pLast = s.coordinateToPrice(dg.lastY);
        if (pNow != null && pLast != null) {
          const dv = pNow - pLast;
          // A vertical line has no price to move — it marks a moment, and
          // dragging it up and down must not invent a height for it.
          if (d.kind !== 'vline') d.v1 += dv;
          if (d.kind === 'trend' || d.kind === 'pitchfork') d.v2 += dv;
          if (d.kind === 'pitchfork') d.v3 += dv;
        }
        /* Moved by whole bar slots, not by time: coordinateToTime is null right
         * of the last candle, so a time delta stopped the drag there. */
        const lNow = c.timeScale().coordinateToLogical(x);
        const lLast = c.timeScale().coordinateToLogical(dg.lastX);
        if (lNow !== null && lLast !== null) {
          const dL = Math.round(lNow) - Math.round(lLast);
          if (dL !== 0) {
            const bars = barsRef.current;
            const secs = inferBarSecs(bars);
            const shift = (t: number): number => {
              const L = timeToLogical(bars, secs, t);
              const moved = L === null ? null : logicalToTime(bars, secs, L + dL);
              return moved === null ? t : Math.round(moved);
            };
            d.t1 = shift(d.t1);
            if (d.kind === 'trend' || d.kind === 'pitchfork') d.t2 = shift(d.t2);
            if (d.kind === 'pitchfork') d.t3 = shift(d.t3);
            // Only advance the reference when a whole slot moved, so slow
            // sub-slot drags accumulate instead of rounding away.
            dg.lastX = x;
          }
        }
        // The overlay owns diagonals now, so moving one is just re-measuring.
        syncLabels();
      }
      dg.lastY = y;
      el!.style.cursor = 'grabbing';
    };
    const endDrag = (e: PointerEvent) => {
      if (!drag.current) return;
      drag.current = null;
      chart.applyOptions({ handleScroll: true, handleScale: true });
      el!.style.cursor = '';
      try { el!.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      persistDrawings();
    };
    el?.addEventListener('pointerdown', onDown);
    el?.addEventListener('pointermove', onMove);
    el?.addEventListener('pointerup', endDrag);
    el?.addEventListener('pointercancel', endDrag);

    return () => {
      el?.removeEventListener('pointerdown', onDown);
      el?.removeEventListener('pointermove', onMove);
      el?.removeEventListener('pointerup', endDrag);
      el?.removeEventListener('pointercancel', endDrag);
      chart.remove(); chartRef.current = null; seriesRef.current = null;
    };
  }, []);

  // ── Load history + trades when symbol/timeframe changes ───────────────
  useEffect(() => {
    if (!symbol) return;
    let alive = true;
    setLoading(true);
    liveBar.current = null;
    trendStart.current = null; forkPts.current = []; setDrawPending(false); clearPreview(); setSelected(null);
    // Detach the previous market's drawing objects (keep them saved), then switch
    // the storage key and load this market/timeframe's saved drawings. They are
    // rendered after the candles load (trend lines need the time axis).
    removeDrawingObjects();
    drawKeyRef.current = DRAW_KEY(symbol, tf);
    drawings.current = loadDrawings(symbol, tf);

    (async () => {
      // Read straight from Supabase (admin-gated by RLS) — no Netlify Function.
      const [barsRes, tradesRes, quoteRes, stateRes] = await Promise.all([
        // Order DESCENDING then flip to ascending below: `.limit()` keeps the rows
        // the DB returns FIRST, so ascending+limit would hand back the OLDEST 1500
        // bars and cut off everything recent (the chart froze days in the past).
        supabase.from('bot_bars').select('ts,open,high,low,close')
          .eq('symbol', symbol).eq('timeframe', tf).order('ts', { ascending: false }).limit(1500),
        supabase.from('bot_trades').select('id,side,open_ts,open_price,close_ts,close_price,sl,tp,pnl,close_reason')
          .eq('symbol', symbol).order('open_ts', { ascending: false }).limit(300),
        supabase.from('bot_quotes').select('digits').eq('symbol', symbol).maybeSingle(),
        // bot_trades only carries orders the bot placed itself. A position it
        // adopted from the broker exists only here, as state='active'.
        supabase.from('bot_market_state').select('state,level,latest_signal,sl,tp')
          .eq('symbol', symbol).maybeSingle(),
      ]);
      if (!alive) return;
      const series = seriesRef.current;
      if (!series) return;

      const fetchedDigits = (quoteRes.data?.digits as number) ?? 5;
      setDigits(fetchedDigits);
      series.applyOptions({
        priceFormat: {
          type: 'price',
          precision: fetchedDigits,
          minMove: 1 / Math.pow(10, fetchedDigits),
        },
      });
      // Fetched newest-first; flip to oldest-first — lightweight-charts requires
      // ascending time order.
      // Row shape stated rather than inferred: rm-server is reached through a
      // client that falls back to a stub when it is unconfigured, and a stub
      // cannot carry the table's types the way a live client does.
      type BarRow = { ts: string; open: number; high: number; low: number; close: number };
      const bars: Candle[] = ((barsRes.data ?? []) as BarRow[]).map((b) => ({
        time: utcTz(b.ts as string),
        open: Number(b.open), high: Number(b.high), low: Number(b.low), close: Number(b.close),
      })).reverse();
      barsRef.current = bars;
      setHasHistory(bars.length > 0);
      setLastBar(bars.length ? bars[bars.length - 1] : null);
      series.setData(bars);
      redrawIndicators(); // recompute active indicators for the new candles
      renderDrawings();   // re-draw saved manual annotations for this market/timeframe

      // CLEAR every overlay from the previous market/timeframe first — otherwise
      // price lines (entry/SL/TP) and markers pile up on the axis and lines from
      // other markets linger. This was the "so many SL/TP" bug.
      overlayLines.current.forEach((l) => series.removePriceLine(l));
      overlayLines.current = [];
      activeSide.current = null;

      if (bars.length) {
        liveBar.current = bars[bars.length - 1];
        chartRef.current?.timeScale().fitContent();

        // If the timeframe is short enough, draw all historical trades as arrows on
        // the candles. (On H4/D1, zooming way out to see years of history means the
        // Also fetched newest-first; flip to oldest-first so trades[last] is the latest.
        const trades: Trade[] = ((tradesRes.data ?? []) as Trade[]).slice().reverse();

        // ONLY the latest trade is marked. Plotting every trade in history buried
        // the candles under BUY/SELL arrows — on an active market that is
        // hundreds of them, and the older ones tell you nothing about now.
        // Snap the trade's open time onto the candle it falls in, so the arrow
        // sits exactly on that bar. open_ts is the precise fill moment, not a bar
        // boundary, so without this the marker floats between candles.
        const snapToBar = (iso: string): UTCTimestamp => {
          const t = utcTz(iso) as number;
          let chosen = bars[0].time;
          for (const b of bars) { if ((b.time as number) <= t) chosen = b.time; else break; }
          return chosen;
        };
        const latest = trades.length ? [trades[trades.length - 1]] : [];
        const markers = latest.map((t) => {
          const buy = t.side === 'buy';
          return {
            time: snapToBar(t.open_ts),
            position: buy ? 'belowBar' : 'aboveBar',
            color: buy ? palette.up : palette.down,
            shape: buy ? 'arrowUp' : 'arrowDown',
            text: buy ? 'BUY' : 'SELL',
          } as SeriesMarker<Time>;
        }).sort((a, b) => (a.time as number) - (b.time as number));
        if (markersApi.current) markersApi.current.setMarkers(markers);
        else markersApi.current = createSeriesMarkers(series, markers);

        // Entry / SL / TP overlay — for an OPEN position AND for a resting PENDING
        // order. bot_market_state is the authority: `level` is the entry (pending
        // or filled), and it stays correct for positions the bot adopted and after
        // the profit lock ratchets the stop. bot_trades is the fallback.
        const openRow = trades.find((t) => !t.close_ts);
        const live = stateRes.data as
          { state?: string; level?: number; latest_signal?: string; sl?: number | null; tp?: number | null } | null;

        const hasPosition = live?.state === 'active' || !!openRow;   // a trade is open
        const hasPending = live?.level != null && !hasPosition;      // limit order resting, not yet filled

        const entry = live?.level != null ? Number(live.level)
          : openRow ? Number(openRow.open_price) : null;
        const sl = live?.sl ?? openRow?.sl ?? null;
        const tp = live?.tp ?? openRow?.tp ?? null;
        tradeSL.current = sl != null ? Number(sl) : null;
        tradeTP.current = tp != null ? Number(tp) : null;

        if (entry != null && (hasPosition || hasPending)) {
          const sig = (live?.latest_signal ?? '').toUpperCase();
          activeSide.current = openRow
            ? (openRow.side === 'sell' ? 'sell' : 'buy')
            : (sig.startsWith('SHORT') || sig.startsWith('SELL') ? 'sell' : 'buy');
          const sideStr = activeSide.current === 'sell' ? 'SELL' : 'BUY';
          // Entry line: solid once filled, dashed while the order is still pending.
          overlayLines.current.push(series.createPriceLine({
            price: entry, color: '#3b9de7', lineWidth: 2,
            lineStyle: hasPending ? LineStyle.Dashed : LineStyle.Solid,
            axisLabelVisible: true, title: hasPending ? `${sideStr} · pending` : sideStr,
          }));
          // SL / TP are now drawn by default (pending and open alike) — no click needed.
          if (tradeSL.current != null) overlayLines.current.push(series.createPriceLine({ price: tradeSL.current, color: palette.down, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'SL' }));
          if (tradeTP.current != null) overlayLines.current.push(series.createPriceLine({ price: tradeTP.current, color: palette.up, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'TP' }));
        }
      }

      setLoading(false);
    })();

    return () => { alive = false; };
    // reloadTick: turning the trade overlays back on rebuilds them from the
    // same query that drew them in the first place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf, reloadTick]);

  // ── Poll the live quote; move the forming candle + price line ─────────
  useEffect(() => {
    if (!symbol) return;
    let alive = true;

    const tick = async () => {
      // Live quote + floating P&L, read directly from Supabase (no Netlify Function).
      const [qRes, msRes] = await Promise.all([
        supabase.from('bot_quotes').select('bid,ask,spread,updated_at').eq('symbol', symbol).maybeSingle(),
        supabase.from('bot_market_state').select('pnl,state').eq('symbol', symbol).maybeSingle(),
      ]);
      if (!alive) return;
      const qd = qRes.data;
      const q: Quote = {
        bid: (qd?.bid as number) ?? null,
        ask: (qd?.ask as number) ?? null,
        spread: (qd?.spread as number) ?? null,
        updated_at: (qd?.updated_at as string) ?? null,
        pnl: (msRes.data?.pnl as number) ?? null,
        state: (msRes.data?.state as string) ?? null,
      };
      setQuote(q);
      const price = q.bid;
      const series = seriesRef.current;
      // Only move the chart when the quote is genuinely fresh — a stale feed
      const fresh = q.updated_at && Date.now() - new Date(q.updated_at).getTime() < 300_000;
      if (fresh && series && price != null && Number.isFinite(price)) {
        const secs = TF_SECONDS[tf] ?? 900;
        const lb = liveBar.current;
        const nowUtcSecs = Math.floor(Date.now() / 1000) + new Date().getTimezoneOffset() * 60;
        const bucket = (Math.floor(nowUtcSecs / secs) * secs) as UTCTimestamp;
        // Intraday: roll into a fresh bucket when the clock crosses it. H4+ : just
        // extend the last historical bar (epoch buckets don't match broker weeks/months).
        if (!lb) {
          liveBar.current = { time: bucket, open: price, high: price, low: price, close: price };
        } else if (secs <= INTRADAY_MAX_SECS && (bucket as number) > (lb.time as number)) {
          liveBar.current = { time: bucket, open: price, high: price, low: price, close: price };
        } else {
          liveBar.current = { time: lb.time, open: lb.open, high: Math.max(lb.high, price), low: Math.min(lb.low, price), close: price };
        }
        series.update(liveBar.current);
        // The legend's C should track the live price, not the last close.
        setLastBar({ ...liveBar.current });
      }
    };

    tick();
    const id = setInterval(tick, 3000); // v7: 3s (was 1.5s) to stay under the free-tier request budget
    return () => { alive = false; clearInterval(id); };
  }, [symbol, tf]);

  const stale = quote?.updated_at ? Date.now() - new Date(quote.updated_at).getTime() > 300_000 : true;
  // Nothing to draw: no candle history AND no live feed to build one from.
  const showEmpty = hasHistory === false && stale && !loading;

  /* ── Workspace chrome ───────────────────────────────────────────────────
   * The trading-desk layout: a top bar, a vertical tool rail, and a status
   * strip. Opt-in, so the admin dashboard keeps the controls it has.
   */
  if (chrome === 'workspace') {
    const canvas = (
      <div className="relative min-w-0 flex-1">
        <div
          ref={wrapRef}
          className={`h-full w-full transition-opacity ${showEmpty ? 'opacity-0' : 'opacity-100'}`}
          style={tool !== 'cursor' ? { cursor: 'crosshair', touchAction: 'none' } : { touchAction: 'none' }}
        />

        {/* Diagonals and their handles. Clipped by the SVG viewport, which is
            how a ray reaches the edge without existing beyond it. */}
        {(segs.length > 0 || handles.length > 0 || ghost.length > 0) && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden">
            {segs.map((g) => (
              <line
                key={g.id}
                x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}
                stroke={g.color}
                strokeWidth={g.width}
                strokeDasharray={g.dash || undefined}
                strokeLinecap="round"
              />
            ))}
            {/* The fork still being placed. Half-opacity so it reads as a
                proposal rather than as something already drawn. */}
            {ghost.map((g) => (
              <line
                key={g.id}
                x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}
                stroke={g.color}
                strokeWidth={g.width}
                strokeDasharray={g.dash || undefined}
                strokeLinecap="round"
                opacity={0.55}
              />
            ))}
            {handles.map((h) => (
              <circle
                key={h.id}
                cx={h.x}
                cy={h.y}
                r={4.5}
                fill="#0b0f0d"
                stroke={DRAW_COLOR}
                strokeWidth={2}
              />
            ))}
          </svg>
        )}

        {/* Diagonal labels, at each line's midpoint. */}
        {lineLabels.map((l) => (
          <span
            key={l.id}
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
            style={{ left: l.x, top: l.y, backgroundColor: l.color }}
          >
            {l.text}
          </span>
        ))}

        {/* The rubber band. pointer-events-none so it never eats the click that
            is about to commit the line it is previewing. */}
        {band && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            <line
              x1={band.flat ? 0 : band.x1}
              y1={band.y1}
              x2={band.flat ? '100%' : band.x2}
              y2={band.y2}
              stroke={DRAW_COLOR}
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
            {!band.flat && (
              <circle cx={band.x1} cy={band.y1} r={4} fill="none" stroke={DRAW_COLOR} strokeWidth={2} />
            )}
          </svg>
        )}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-fg-muted">
            Loading {alias}…
          </div>
        )}
        {showEmpty && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-hover">
              <CandlestickChart className="h-6 w-6 text-fg-subtle" />
            </div>
            <p className="text-sm font-semibold text-fg">No candles for {alias}</p>
            <p className="max-w-md text-xs leading-relaxed text-fg-muted">
              No history in <code className="font-mono text-fg-subtle">bot_bars</code> for this
              market/timeframe. Candles are synced by{' '}
              <code className="font-mono text-fg-subtle">scripts.bar_sync</code> on the VM — if it
              isn’t running, history stops refreshing.
            </p>
          </div>
        )}
      </div>
    );

    return (
      <div
        ref={cardRef}
        className={`relative flex h-full min-h-0 flex-col overflow-hidden bg-bg ${fs ? 'h-screen' : ''}`}
      >
        {/* Top bar */}
        <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            title="Change market"
            className="flex items-center gap-2 rounded-sm px-2 py-1.5 transition-colors hover:bg-brand/10"
          >
            {/* The ticker, not the broker's full name: MT5 calls this market
                "Volatility 25 Index", which shoves the rest of the bar off the
                edge. The long name lives in the search list. */}
            <SymbolAvatar symbol={alias} />
            <span className="max-w-[10rem] truncate text-sm font-bold text-fg" title={symbol}>
              {alias}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
          </button>

          {/* Timeframe. bot_bars syncs M15 and H1 only (backend v7), so the
              menu lists two — a wider one would be a menu of dead entries. */}
          <TopMenu label={tf}>
            {(close) => ALL_TIMEFRAMES.map((f) => {
              const synced = TF_VALUES.includes(f.value);
              return (
                <MenuItem
                  key={f.value}
                  active={tf === f.value}
                  disabled={!synced}
                  title={synced ? undefined : 'bar_sync stores M15 and H1 only — no candles exist for this'}
                  onClick={synced ? () => { setTf(f.value); close(); } : undefined}
                >
                  {f.label}
                </MenuItem>
              );
            })}
          </TopMenu>

          {/* Chart type. The series is a candlestick series and its markers and
              price lines hang off it, so Line and Area are listed as the design
              lists them, and disabled because picking one would change nothing. */}
          <TopMenu label="Candles">
            {() => CHART_TYPES.map((t) => (
              <MenuItem
                key={t}
                active={t === 'Candles'}
                disabled={t !== 'Candles'}
                title={t === 'Candles' ? undefined : 'not drawn yet — the series is a candlestick series'}
              >
                <CandlestickChart className="mr-2 inline-block h-3.5 w-3.5 align-middle text-brand" />
                {t}
              </MenuItem>
            ))}
          </TopMenu>

          {/* Layout: what the chart shows, as opposed to what it plots. */}
          <TopMenu label="Layout">
            {(close) => (
              <>
                <MenuItem onClick={() => { chartRef.current?.timeScale().fitContent(); close(); }}>
                  Fit to data
                </MenuItem>
                <MenuItem onClick={() => { chartRef.current?.timeScale().scrollToRealTime(); close(); }}>
                  Jump to latest
                </MenuItem>
                {/* Not `active`: these are actions, and a green "Hide grid"
                    reads as "the grid is hidden" — the opposite of the truth. */}
                <MenuItem onClick={() => { setGridOn((v) => !v); close(); }}>
                  {gridOn ? 'Hide grid' : 'Show grid'}
                </MenuItem>
                <MenuItem onClick={() => { toggleOverlays(); close(); }}>
                  {overlaysOn ? 'Hide trade overlays' : 'Show trade overlays'}
                </MenuItem>
              </>
            )}
          </TopMenu>

          <button
            type="button"
            onClick={() => setLibraryOpen(true)}
            className="flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-sm text-fg transition-colors hover:bg-brand/10 hover:text-brand"
          >
            <LineChart className="h-3.5 w-3.5" />
            Indicators
          </button>

          <RailBtn
            active={favs.includes(symbol)}
            onClick={toggleFav}
            title={favs.includes(symbol) ? 'Remove from favourites' : 'Add to favourites'}
          >
            <Bookmark className={`h-4 w-4 ${favs.includes(symbol) ? 'fill-current' : ''}`} />
          </RailBtn>

          <RailBtn onClick={undoDrawing} title="Undo drawing">
            <Undo2 className="h-4 w-4" />
          </RailBtn>
          <RailBtn onClick={redoDrawing} title="Redo drawing">
            <Redo2 className="h-4 w-4" />
          </RailBtn>

          <div className="ml-auto flex items-center gap-1 pr-1">
            {quote?.pnl != null && (
              <span className="text-right leading-tight">
                <span className="block text-[9px] uppercase tracking-[0.18em] font-bold text-fg-subtle">
                  Open P&amp;L
                </span>
                <span
                  className={`block font-mono tabular text-sm font-bold ${
                    Number(quote.pnl) >= 0 ? 'text-brand' : 'text-danger'
                  }`}
                >
                  {Number(quote.pnl) >= 0 ? '+' : ''}{Number(quote.pnl).toFixed(2)}
                </span>
              </span>
            )}
            <a
              href={`/bot/${encodeURIComponent(symbol)}`}
              title={`${alias} — the bot's full read on this market`}
              className="flex h-9 w-9 items-center justify-center rounded-sm text-fg-muted transition-colors hover:bg-brand/10 hover:text-brand"
            >
              <FileText className="h-4 w-4" />
            </a>
            <RailBtn
              active={overlaysOn}
              onClick={toggleOverlays}
              title={overlaysOn ? 'Hide entry / SL / TP overlays' : 'Show entry / SL / TP overlays'}
            >
              <Layers className="h-4 w-4" />
            </RailBtn>
            <RailBtn onClick={copyCandles} title={copied ? 'Copied' : 'Copy these candles as CSV'}>
              {copied ? <Check className="h-4 w-4 text-brand" /> : <Code2 className="h-4 w-4" />}
            </RailBtn>
            <RailBtn onClick={saveScreenshot} title="Save a picture of this chart">
              <Camera className="h-4 w-4" />
            </RailBtn>
            <RailBtn onClick={toggleFullscreen} title={fs ? 'Exit full screen' : 'Full screen'}>
              {fs ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </RailBtn>
          </div>
        </div>

        {/* Canvas, with the tool rail floating ON it rather than beside it —
            the rail belongs to the chart, and a bordered column outside it
            just eats width from the candles. */}
        {/* pl-12 clears the rail: it is absolutely positioned, so without this
            it would sit on top of the left-most candles and the price axis. */}
        <div className="relative flex min-h-0 flex-1 pl-12">
          {canvas}

          {/* Flush to the chart's left edge and full height, as in the design.
              Inset-and-floating left a band of dead canvas beside it. */}
          {/* Collapsed: one button to bring it back, so the rail can get out
              of the way on a narrow screen without being gone for good. */}
          {railHidden && (
            <div className="absolute left-0 top-2 z-20">
              <button
                type="button"
                onClick={() => setRailHidden(false)}
                title="Show drawing tools"
                aria-label="Show drawing tools"
                className="flex h-9 w-7 items-center justify-center rounded-r-md border border-l-0 border-border bg-bg-elevated/95 text-fg-muted backdrop-blur-sm transition-colors hover:text-brand"
              >
                <ChevronsRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* overflow-VISIBLE, deliberately.
              This was overflow-y-auto, and CSS computes the other axis to auto
              alongside it — so the drawing menu, which opens to the RIGHT of a
              48px column, was clipped to that column and invisible. Clicking
              the chevron did open it; there was simply nothing to see.
              The tools now fit without scrolling, so the scroll is not needed. */}
          <div
            className={`absolute inset-y-0 left-0 z-20 w-12 flex-col items-center gap-0.5 overflow-visible border-r border-border bg-bg-elevated/95 py-2 backdrop-blur-sm ${
              railHidden ? 'hidden' : 'flex'
            }`}
          >
            <RailBtn active={tool === 'cursor'} onClick={() => {
              setTool('cursor');
              trendStart.current = null; forkPts.current = []; setDrawPending(false); clearPreview();
            }} title="Crosshair">
              <Crosshair className="h-4 w-4" />
            </RailBtn>
            {/* SPLIT BUTTON. The icon arms the line type you last used — one
                click, no menu, no shortcut to remember. The chevron beneath it
                opens the list, and picking from there becomes the new default.
                The rail cannot hold nine line types as nine icons, and making
                you walk a menu for every line is the thing that makes drawing
                tools feel slow. */}
            <div
              className={`group relative flex h-9 items-center rounded-sm transition-colors ${
                tool !== 'cursor' ? 'bg-brand/15 ring-1 ring-brand/40' : 'hover:bg-brand/10'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  setTool(lastLine);
                  trendStart.current = null;
                  forkPts.current = [];
                  setDrawPending(false);
                  clearPreview();
                }}
                title={`${[...LINE_TOOLS, ...EXTRA_TOOLS].find((t) => t.tool === lastLine)?.label ?? 'Draw'}`
                  + (tool === 'cursor' ? ' — click to arm' : ' — armed')}
                className={`flex h-9 w-8 items-center justify-center rounded-l-sm transition-colors ${
                  tool !== 'cursor' ? 'text-brand' : 'text-fg-muted group-hover:text-brand'
                }`}
              >
                {(() => {
                  const Icon = TOOL_ICON[lastLine] ?? PenLine;
                  return <Icon className="h-4 w-4" />;
                })()}
              </button>
              {/* At the RIGHT EDGE of the icon, not under it — one control, two
                  halves, the way the design has it. */}
              <button
                type="button"
                onClick={() => setDrawOpen((v) => !v)}
                title="Choose a line type"
                aria-label="Choose a line type"
                className={`flex h-9 w-3.5 items-center justify-center rounded-r-sm transition-colors ${
                  drawOpen ? 'text-brand' : 'text-fg-subtle group-hover:text-brand'
                }`}
              >
                <ChevronRight className="h-3 w-3" />
              </button>
              {drawOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Dismiss drawing tools"
                    onClick={() => setDrawOpen(false)}
                    className="fixed inset-0 z-40 cursor-default"
                  />
                  <div className="scrollbar-none absolute left-[calc(100%+6px)] top-0 z-50 max-h-[70vh] w-64 overflow-y-auto rounded-sm border border-border bg-surface-raised py-2 shadow-xl">
                    {([
                      ['Lines', [...LINE_TOOLS, ...EXTRA_TOOLS]],
                      ['Channels', CHANNEL_TOOLS],
                      ['Pitchforks', PITCHFORK_TOOLS],
                    ] as const).map(([group, items]) => (
                      <div key={group}>
                        <p className="px-3 pb-1 pt-3 text-[10px] uppercase tracking-[0.18em] font-bold text-fg-subtle first:pt-1">
                          {group}
                        </p>
                        {items.map((t) => (
                          <button
                            key={t.label}
                            type="button"
                            disabled={t.soon}
                            title={t.soon ? 'Not built yet' : undefined}
                            onClick={() => {
                              if (!t.tool) return;
                              // Picking from the list arms it AND becomes what
                              // the rail button arms next time.
                              setTool(t.tool);
                              setLastLine(t.tool);
                              setDrawOpen(false);
                              trendStart.current = null;
                              forkPts.current = [];
                              setDrawPending(false);
                              clearPreview();
                            }}
                            className={`flex w-full items-center gap-3 px-3 py-2 text-left text-[15px] transition-colors ${
                              tool === t.tool && !t.soon
                                ? 'bg-brand/15 font-semibold text-brand'
                                : t.soon
                                  ? 'cursor-not-allowed text-fg-subtle/50'
                                  : 'text-fg hover:bg-brand/10 hover:text-brand'
                            }`}
                          >
                            <span className="w-4 shrink-0 text-center font-mono text-fg-subtle">{t.glyph}</span>
                            <span className="truncate">{t.label}</span>
                            <span className="ml-auto flex shrink-0 items-center gap-1.5">
                              {tool === t.tool && !t.soon && <Check className="h-3.5 w-3.5" />}
                              {t.keys && <span className="font-mono text-[11px] text-fg-subtle">{t.keys}</span>}
                            </span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            {/* The standalone Horizontal Line and Labelled Level buttons are
                gone: they are in the split button's menu, and having both meant
                arming one tool lit TWO buttons green — which reads as
                everything being selected at once. One tool, one lit control. */}
            <RailBtn active={gridOn} onClick={() => setGridOn((v) => !v)} title={gridOn ? 'Hide grid' : 'Show grid'}>
              <Grid3x3 className="h-4 w-4" />
            </RailBtn>
            <RailBtn onClick={toggleFullscreen} title={fs ? 'Exit full screen' : 'Full screen'}>
              <Maximize2 className="h-4 w-4" />
            </RailBtn>
            {/* Same destination as the top bar's Indicators — one library, two
                ways in, rather than two different indicator UIs. */}
            <RailBtn active={inds.size > 0} onClick={() => setLibraryOpen(true)} title="Indicators">
              <BarChart3 className="h-4 w-4" />
            </RailBtn>

            <span className="my-1.5 h-px w-7 bg-border" />

            {/* Snap back to the live edge after scrolling into history. */}
            <RailBtn
              onClick={() => chartRef.current?.timeScale().scrollToRealTime()}
              title="Jump to the latest candle"
            >
              <Zap className="h-4 w-4" />
            </RailBtn>

            {/* These act on YOUR drawings: freeze them, hide them, delete them.
                Hiding keeps the list; only the trash empties it. */}
            <RailBtn
              active={drawingsLocked}
              onClick={() => setDrawingsLocked((v) => !v)}
              title={drawingsLocked ? 'Unlock drawings' : 'Lock drawings in place'}
            >
              {drawingsLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            </RailBtn>
            <RailBtn
              active={drawingsHidden}
              onClick={() => setDrawingsHidden((v) => !v)}
              title={drawingsHidden ? 'Show drawings' : 'Hide drawings'}
            >
              {drawingsHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </RailBtn>

            <span className="my-1.5 h-px w-7 bg-border" />

            <RailBtn onClick={clearDrawings} title="Delete all drawings">
              <Trash2 className="h-4 w-4" />
            </RailBtn>

            {/* Pushed to the bottom, as in the design: the rail folds away when
                you want the candles and not the tools. */}
            <span className="mt-auto" />
            <RailBtn onClick={() => setRailHidden(true)} title="Hide the toolbar">
              <ChevronsLeft className="h-4 w-4" />
            </RailBtn>
          </div>
        </div>

        {/* STYLE TOOLBAR — appears when a drawing is selected, acts on that
            one. Floated over the candles rather than docked, so it is next to
            the thing it edits. */}
        {selected && (
          <div className="absolute left-1/2 top-3 z-40 -translate-x-1/2">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-bg-elevated/95 px-1.5 py-1 shadow-xl backdrop-blur-sm">
              <GripVertical className="h-4 w-4 shrink-0 text-fg-subtle" />

              {/* Colour */}
              <DrawMenu label={<span className="h-3.5 w-3.5 rounded-sm" style={{ backgroundColor: selected.color ?? DRAW_COLOR }} />}>
                {(close) => (
                  <div className="flex items-center gap-1.5 p-2">
                    {DRAW_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={c}
                        onClick={() => { patchDrawing(selected.id, { color: c }); close(); }}
                        className={`h-5 w-5 rounded-sm ring-offset-1 ring-offset-bg-elevated transition-all ${
                          (selected.color ?? DRAW_COLOR) === c ? 'ring-2 ring-fg' : ''
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                )}
              </DrawMenu>

              {/* Width */}
              <DrawMenu label={<span className="font-mono text-[11px]">{selected.width ?? 2}px</span>}>
                {(close) => DRAW_WIDTHS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => { patchDrawing(selected.id, { width: w }); close(); }}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors ${
                      (selected.width ?? 2) === w ? 'bg-brand/15 text-brand' : 'text-fg hover:bg-brand/10'
                    }`}
                  >
                    <span className="w-6 shrink-0 rounded bg-current" style={{ height: w }} />
                    {w}px
                  </button>
                ))}
              </DrawMenu>

              {/* Dash pattern */}
              <DrawMenu label={<Minus className="h-3.5 w-3.5" />}>
                {(close) => DRAW_STYLES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => { patchDrawing(selected.id, { style: s.key }); close(); }}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors ${
                      (selected.style ?? (selected.kind === 'hline' ? 'dashed' : 'solid')) === s.key
                        ? 'bg-brand/15 text-brand' : 'text-fg hover:bg-brand/10'
                    }`}
                  >
                    <svg width="24" height="2" className="shrink-0">
                      <line x1="0" y1="1" x2="24" y2="1" stroke="currentColor" strokeWidth="2" strokeDasharray={s.dash} />
                    </svg>
                    {s.label}
                  </button>
                ))}
              </DrawMenu>

              <span className="mx-0.5 h-5 w-px bg-border" />

              {/* Label. Only a horizontal line carries one — it is drawn on the
                  price axis, which a diagonal has no place on. */}
              {/* Any drawing can be labelled now. A level's label rides the
                  price axis; a diagonal's is drawn at its midpoint by the
                  overlay below, which is why this was limited before. */}
              <button
                type="button"
                title="Label this drawing"
                onClick={() => {
                  const next = window.prompt('Label', selected.label ?? '');
                  if (next == null) return;
                  patchDrawing(selected.id, { label: next.trim() || undefined });
                }}
                className={`flex h-7 w-7 items-center justify-center rounded-sm transition-colors ${
                  selected.label ? 'bg-brand/15 text-brand' : 'text-fg hover:bg-brand/10 hover:text-brand'
                }`}
              >
                <Type className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setDrawingsLocked((v) => !v)}
                title={drawingsLocked ? 'Unlock drawings' : 'Lock drawings'}
                className={`flex h-7 w-7 items-center justify-center rounded-sm transition-colors ${
                  drawingsLocked ? 'bg-brand/15 text-brand' : 'text-fg hover:bg-brand/10 hover:text-brand'
                }`}
              >
                {drawingsLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
              </button>

              <button
                type="button"
                onClick={() => deleteDrawing(selected.id)}
                title="Delete this drawing"
                className="flex h-7 w-7 items-center justify-center rounded-sm text-danger transition-colors hover:bg-danger/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>

              <DrawMenu label={<MoreVertical className="h-3.5 w-3.5" />} align="right">
                {(close) => (
                  <>
                    <button
                      type="button"
                      onClick={() => { duplicateDrawing(selected.id); close(); }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-fg transition-colors hover:bg-brand/10"
                    >
                      <Copy className="h-3.5 w-3.5" /> Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        patchDrawing(selected.id, { color: undefined, width: undefined, style: undefined });
                        close();
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-fg transition-colors hover:bg-brand/10"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Reset settings
                    </button>
                    {/* Bring to front / send to back are in the design and not
                        here: this library draws each drawing as its own series
                        and gives no z-order control over them. Listing them as
                        dead menu items would be worse than leaving them out. */}
                  </>
                )}
              </DrawMenu>
            </div>
          </div>
        )}

        {/* OHLC of the hovered bar, top-left over the candles, as the design
            has it. The change is against that bar's own open — what this
            candle did — not against yesterday's close. */}
        {(() => {
          const bar = hoverBar ?? lastBar;
          if (!bar) return null;
          const chg = bar.close - bar.open;
          const pct = bar.open ? (chg / bar.open) * 100 : 0;
          const cls = chg > 0 ? 'text-brand' : chg < 0 ? 'text-danger' : 'text-fg-muted';
          return (
            <div className="pointer-events-none absolute left-14 top-14 z-30 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px]">
              {([['O', bar.open], ['H', bar.high], ['L', bar.low], ['C', bar.close]] as const).map(
                ([k, v]) => (
                  <span key={k} className="whitespace-nowrap">
                    <span className="text-fg-subtle">{k} </span>
                    <span className={cls}>{fmt(v, digits)}</span>
                  </span>
                ),
              )}
              <span className={`whitespace-nowrap ${cls}`}>
                {chg >= 0 ? '+' : ''}{fmt(chg, digits)} ({chg >= 0 ? '+' : ''}{pct.toFixed(2)}%)
              </span>
            </div>
          );
        })()}

        {/* ARMED-TOOL BANNER.
            A two-click tool takes one click and draws nothing — correct, and
            indistinguishable from broken when nothing on screen says a tool is
            even armed. The old desk toolbar had this hint; the new chrome
            never got it, so every drawing tool looked dead. */}
        {tool !== 'cursor' && (
          <div className="pointer-events-none absolute left-1/2 top-16 z-30 -translate-x-1/2">
            <span className="flex items-center gap-2 rounded-full border border-brand/40 bg-bg-elevated/95 px-3 py-1.5 text-[11px] shadow-lg backdrop-blur-sm">
              <PenLine className="h-3.5 w-3.5 text-brand" />
              <span className="font-semibold text-brand">{armed?.label ?? tool}</span>
              <span className="text-fg-muted">
                {drawPending
                  // A three-click tool has to say WHICH point it is waiting
                  // for: "click the second point" through two of them is the
                  // same hint twice, and reads as a click that did not land.
                  ? armed?.clicks === 3
                    ? `click the ${forkPts.current.length === 1 ? 'second' : 'third'} point`
                    : 'click the second point'
                  : armed?.clicks === 3
                    ? 'click the pivot'
                    : armed?.clicks === 2
                      ? 'click the first point'
                      : 'click a price on the chart'}
              </span>
              <span className="text-fg-subtle">· Esc to cancel</span>
            </span>
          </div>
        )}

        {/* Status strip. "Market open" is the quote feed moving — the only
            evidence this page actually has that the market is trading. */}
        <div className="flex h-8 shrink-0 items-center gap-3 border-t border-border px-3 text-[11px]">
          <span className={`flex items-center gap-1.5 font-semibold ${stale ? 'text-danger' : 'text-brand'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${stale ? 'bg-danger' : 'bg-brand'}`} />
            {stale ? 'Feed stale' : 'Market open'}
          </span>
          <span className="font-mono text-fg-subtle">
            {quote?.updated_at ? <>Last update <TimeAgo iso={quote.updated_at} /></> : 'No quote yet'}
          </span>
          <span className="ml-auto font-mono text-fg-subtle">
            {quote?.updated_at ? `${new Date(quote.updated_at).toISOString().slice(11, 19)} UTC` : '—'}
          </span>
          <span className="rounded-sm bg-surface-hover px-1.5 py-0.5 font-mono font-bold text-fg-muted">
            {tf}
          </span>
        </div>

        {libraryOpen && (
          <IndicatorLibrary
            active={inds}
            favs={indFavs}
            onToggle={toggleInd}
            onFav={toggleIndFav}
            onClose={() => setLibraryOpen(false)}
          />
        )}

        {searchOpen && (
          <SymbolSearch
            markets={markets}
            current={symbol}
            favs={favs}
            onPick={(s) => { setSymbol(s); setSearchOpen(false); }}
            onClose={() => setSearchOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Controls + ticker */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="rounded-md border border-border bg-bg px-3 py-1.5 text-sm font-semibold text-fg outline-none focus:border-brand">
          {markets.map((m) => <option key={m.symbol} value={m.symbol}>{label(m.symbol)}{openBySymbol.has(m.symbol) ? '  ●' : ''}</option>)}
        </select>
        <div className="inline-flex rounded-md border border-border overflow-hidden">
          {TIMEFRAMES.map((f) => (
            <button key={f.value} type="button" onClick={() => setTf(f.value)}
              className={`px-2.5 py-1.5 text-xs font-bold ${tf === f.value ? 'bg-brand text-brand-fg' : 'text-fg-muted hover:bg-surface-hover'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-4 text-sm">
          {quote?.pnl != null && (
            <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono tabular text-sm font-bold ${Number(quote.pnl) >= 0 ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>
              P/L {Number(quote.pnl) >= 0 ? '+' : ''}{Number(quote.pnl).toFixed(2)}
            </span>
          )}
          <span className="font-mono tabular">
            <span className="text-fg-subtle text-xs">BID </span><span className="font-bold text-fg">{fmt(quote?.bid, digits)}</span>
            <span className="text-fg-subtle text-xs ml-3">ASK </span><span className="font-bold text-fg">{fmt(quote?.ask, digits)}</span>
          </span>
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${stale ? 'text-danger' : 'text-success'}`}>
            <span className={`h-2 w-2 rounded-full ${stale ? 'bg-danger' : 'bg-success'}`} />{stale ? 'feed stale' : 'live'}
          </span>
        </div>
      </div>

      {/* Jump straight to a market that has an ongoing trade, then watch the
          candle move live with its entry/SL/TP overlaid. */}
      {openBySymbol.size > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-fg-subtle">Ongoing trades:</span>
          {[...openBySymbol.entries()].map(([sym, side]) => (
            <button key={sym} type="button" onClick={() => setSymbol(sym)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold transition-colors ${symbol === sym ? 'border-brand text-brand' : 'border-border text-fg-muted hover:text-fg hover:bg-surface-hover'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${side === 'sell' ? 'bg-danger' : 'bg-success'}`} />
              {label(sym)}
            </button>
          ))}
        </div>
      )}

      <div
        ref={cardRef}
        className={`relative flex flex-col rounded-lg border border-border bg-bg-elevated overflow-hidden ${fs ? 'h-screen rounded-none' : 'h-[560px] md:h-[680px]'}`}
      >
        {/* Chart toolbar: drawing tools · indicators (left) + fullscreen (right).
            In fullscreen the outer controls are hidden, so the market picker,
            timeframe toggle and live quote are mirrored into the toolbar here. */}
        <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
          {fs && (
            <>
              <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="rounded-md border border-border bg-bg px-2 py-1 text-xs font-semibold text-fg outline-none focus:border-brand">
                {markets.map((m) => <option key={m.symbol} value={m.symbol}>{label(m.symbol)}</option>)}
              </select>
              <div className="ml-1 inline-flex rounded-md border border-border overflow-hidden">
                {TIMEFRAMES.map((f) => (
                  <button key={f.value} type="button" onClick={() => setTf(f.value)}
                    className={`px-2 py-1 text-[11px] font-bold ${tf === f.value ? 'bg-brand text-brand-fg' : 'text-fg-muted hover:bg-surface-hover'}`}>
                    {f.label}
                  </button>
                ))}
              </div>
              <span className="mx-1 h-5 w-px bg-border" />
            </>
          )}
          <ToolBtn active={tool === 'cursor'} onClick={() => setTool('cursor')} title="Cursor"><MousePointer2 className="h-4 w-4" /></ToolBtn>
          <ToolBtn active={tool === 'hline'} onClick={() => setTool('hline')} title="Horizontal line — click a price"><Minus className="h-4 w-4" /></ToolBtn>
          <ToolBtn active={tool === 'trend'} onClick={() => setTool('trend')} title="Trend line — click two points"><PenLine className="h-4 w-4" /></ToolBtn>
          <ToolBtn active={false} onClick={clearDrawings} title="Clear drawings"><Eraser className="h-4 w-4" /></ToolBtn>

          <span className="mx-1 h-5 w-px bg-border" />
          {/* The 4 indicators. */}
          {IND_META.map((m) => (
            <button key={m.id} type="button" onClick={() => toggleInd(m.id)} title={m.title}
              className={`inline-flex h-8 items-center rounded-md px-2 text-[11px] font-bold transition-colors ${inds.has(m.id) ? 'text-brand-fg' : 'text-fg-muted hover:text-fg hover:bg-surface-hover'}`}
              style={inds.has(m.id) ? { backgroundColor: m.color } : undefined}>
              {m.label}
            </button>
          ))}

          {tool === 'trend' && trendStart.current && <span className="ml-1 text-[11px] text-fg-subtle">click the second point…</span>}
          {fs && quote && (
            <span className="ml-auto mr-2 flex items-center gap-3 font-mono text-xs">
              {quote.pnl != null && (
                <span className={`font-bold ${Number(quote.pnl) >= 0 ? 'text-success' : 'text-danger'}`}>P/L {Number(quote.pnl) >= 0 ? '+' : ''}{Number(quote.pnl).toFixed(2)}</span>
              )}
              <span><span className="text-fg-subtle">BID </span><span className="font-bold text-fg">{fmt(quote.bid, digits)}</span></span>
              <span className={`inline-flex items-center gap-1 font-semibold ${stale ? 'text-danger' : 'text-success'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${stale ? 'bg-danger' : 'bg-success'}`} />{stale ? 'stale' : 'live'}
              </span>
            </span>
          )}
          <button
            type="button"
            onClick={toggleFullscreen}
            title={fs ? 'Exit full screen' : 'Full screen'}
            className={`${fs ? '' : 'ml-auto'} inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-surface-hover`}
          >
            {fs ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>

        {/* Canvas — fills remaining height; hidden behind the placeholder when empty. */}
        <div
          ref={wrapRef}
          className={`flex-1 w-full transition-opacity ${showEmpty ? 'opacity-0' : 'opacity-100'}`}
          style={tool !== 'cursor' ? { cursor: 'crosshair' } : undefined}
        />

        {loading && <div className="absolute inset-0 flex items-center justify-center text-sm text-fg-muted">Loading {alias}…</div>}

        {showEmpty && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-hover">
              <CandlestickChart className="h-6 w-6 text-fg-subtle" />
            </div>
            <p className="text-sm font-semibold text-fg">No candles for {alias}</p>
            <p className="max-w-md text-xs text-fg-muted leading-relaxed">
              No history in <code className="font-mono text-fg-subtle">bot_bars</code> for this market/timeframe.
              Candles are synced by <code className="font-mono text-fg-subtle">scripts.bar_sync</code> on the VM —
              if it isn’t running, history stops refreshing.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** The two-letter square the mock puts before a symbol. */
function SymbolAvatar({ symbol, size = 'sm' }: { symbol: string; size?: 'sm' | 'md' }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-sm bg-brand/15 font-bold text-brand ${
        size === 'md' ? 'h-8 w-8 text-[11px]' : 'h-6 w-6 text-[10px]'
      }`}
    >
      {symbol.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** Full-panel symbol picker: type to filter, or narrow by asset class. */
function SymbolSearch({ markets, current, favs, onPick, onClose }: {
  markets: { symbol: string; alias: string }[];
  current: string;
  favs: string[];
  onPick: (symbol: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [cls, setCls] = useState<AssetClass | 'all'>('all');

  const needle = q.trim().toLowerCase();
  const rows = markets
    .map((m) => ({ ...m, cls: classify(m.symbol), desc: describe(m.symbol, m.alias) }))
    .filter((m) => (cls === 'all' ? true : m.cls === cls))
    .filter((m) =>
      !needle
      || m.symbol.toLowerCase().includes(needle)
      || m.alias.toLowerCase().includes(needle)
      || m.desc.toLowerCase().includes(needle))
    // Starred markets first — that is the whole point of starring one.
    .sort((a, b) => Number(favs.includes(b.symbol)) - Number(favs.includes(a.symbol)));

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center overflow-hidden p-4 sm:p-8">
      {/* Backdrop: dismisses, and keeps the chart visible behind the card so
          the picker reads as a layer over it rather than a new screen. */}
      <button
        type="button"
        aria-label="Dismiss symbol search"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60"
      />
      <div className="relative flex max-h-full w-full max-w-[460px] flex-col overflow-hidden rounded-sm border border-border bg-bg-elevated shadow-xl">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h3 className="text-sm font-bold text-fg">Symbol Search</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close symbol search"
          className="ml-auto rounded-sm p-1 text-fg-subtle transition-colors hover:bg-brand/10 hover:text-brand"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 pt-3">
        {/* Neutral until it is focused — a permanent green outline reads as a
            validation state on a field that has nothing to validate. */}
        <div className="flex items-center gap-2 rounded-sm border border-border px-3 py-2 focus-within:border-brand">
          <Search className="h-4 w-4 shrink-0 text-fg-subtle" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && rows[0]) onPick(rows[0].symbol);
            }}
            placeholder="Search symbols"
            // focus-visible:outline-none — the global focus ring would draw a
            // second green outline inside the box that already shows focus.
            // Inline, not a class: globals.css paints a 3px brand ring on every
            // :focus-visible input, and the box around this one already shows
            // focus — two green rings, one inside the other.
            style={{ outline: 'none', boxShadow: 'none' }}
            className="min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-subtle"
          />
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1">
          {CLASS_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setCls(t.key)}
              className={`rounded-sm px-2.5 py-1 text-[13px] transition-colors ${
                cls === t.key
                  ? 'bg-brand/15 font-semibold text-brand'
                  : 'text-fg-muted hover:bg-brand/10 hover:text-brand'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-fg-subtle">
            Nothing matches “{q}”. Only markets the bot follows are listed.
          </p>
        ) : (
          <ul>
            {rows.map((m) => (
              <li key={m.symbol}>
                <button
                  type="button"
                  onClick={() => onPick(m.symbol)}
                  className={`flex w-full items-center gap-2.5 rounded-sm px-2 py-2 text-left transition-colors hover:bg-brand/10 ${
                    m.symbol === current ? 'bg-brand/10' : ''
                  }`}
                >
                  <SymbolAvatar symbol={m.alias} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 truncate text-sm font-bold text-fg">
                      {m.alias}
                      {favs.includes(m.symbol) && <Bookmark className="h-3 w-3 shrink-0 fill-current text-brand" />}
                    </span>
                    {m.desc && <span className="block truncate text-[11px] text-fg-subtle">{m.desc}</span>}
                  </span>
                  {CLASS_TAG[m.cls] && (
                    <span className="ml-auto shrink-0 rounded-sm bg-surface-hover px-1.5 py-0.5 text-[10px] font-bold text-fg-muted">
                      {CLASS_TAG[m.cls]}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      </div>
    </div>
  );
}

/**
 * The indicator library.
 *
 * The design's shape — search, categories down the side, star-to-favourite —
 * over what this chart can actually plot: four, computed in the browser from
 * the loaded candles. A category with nothing in it says so rather than
 * listing names that would draw nothing. Orderflow needs tick data the bot
 * does not store; the Highscore library is where the bot's own features
 * (ADX, RSI, EMA50/200 — it computes them, it just never saves them per bar)
 * would land once they are persisted.
 */
const IND_CATEGORIES: { key: string; label: string; note?: string }[] = [
  { key: 'favorites', label: 'Favorites' },
  { key: 'basic', label: 'Basic' },
  { key: 'orderflow', label: 'Orderflow', note: 'Needs tick-level data. bot_bars stores OHLC candles only.' },
  { key: 'highscore', label: 'Highscore', note: 'The bot computes ADX, RSI and its EMAs to decide trades, but stores no per-bar history of them yet.' },
];

function IndicatorLibrary({ active, favs, onToggle, onFav, onClose }: {
  active: Set<IndId>;
  favs: string[];
  onToggle: (id: IndId) => void;
  onFav: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('basic');

  const needle = q.trim().toLowerCase();
  const rows = IND_META
    .filter((m) => (cat === 'favorites' ? favs.includes(m.id) : cat === 'basic'))
    .filter((m) => !needle || m.label.toLowerCase().includes(needle) || m.title.toLowerCase().includes(needle));
  const note = IND_CATEGORIES.find((c) => c.key === cat)?.note;

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center overflow-hidden p-4 sm:p-8">
      <button
        type="button"
        aria-label="Dismiss indicators"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60"
      />
      <div className="relative flex max-h-full w-full max-w-[620px] flex-col overflow-hidden rounded-sm border border-border bg-bg-elevated shadow-xl">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <h3 className="text-sm font-bold text-fg">Indicators</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close indicators"
            className="ml-auto rounded-sm p-1 text-fg-subtle transition-colors hover:bg-brand/10 hover:text-brand"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 pt-3">
          <div className="flex items-center gap-2 rounded-sm border border-border px-3 py-2 focus-within:border-brand">
            <Search className="h-4 w-4 shrink-0 text-fg-subtle" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
              placeholder="Search indicators"
              // Inline, not a class: globals.css paints a 3px brand ring on every
            // :focus-visible input, and the box around this one already shows
            // focus — two green rings, one inside the other.
            style={{ outline: 'none', boxShadow: 'none' }}
            className="min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-subtle"
            />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 gap-3 px-4 py-3">
          <nav className="w-36 shrink-0">
            {IND_CATEGORIES.map((c, i) => (
              <div key={c.key}>
                {i === 1 && (
                  <p className="px-2 pb-1 pt-3 text-[10px] uppercase tracking-[0.18em] font-bold text-fg-subtle">
                    Built-ins
                  </p>
                )}
                {i === 3 && (
                  <p className="px-2 pb-1 pt-3 text-[10px] uppercase tracking-[0.18em] font-bold text-fg-subtle">
                    Library
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setCat(c.key)}
                  className={`block w-full rounded-sm px-2 py-1.5 text-left text-sm transition-colors ${
                    cat === c.key ? 'bg-brand/15 font-semibold text-brand' : 'text-fg-muted hover:bg-brand/10 hover:text-brand'
                  }`}
                >
                  {c.label}
                </button>
              </div>
            ))}
          </nav>

          <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto border-l border-border pl-3">
            {rows.length === 0 ? (
              <p className="px-2 py-8 text-center text-[13px] leading-relaxed text-fg-subtle">
                {note ?? (cat === 'favorites' ? 'Star an indicator to keep it here.' : 'Nothing matches.')}
              </p>
            ) : (
              <ul>
                {rows.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 rounded-sm px-2 py-2 hover:bg-brand/10">
                    <button type="button" onClick={() => onToggle(m.id)} className="min-w-0 flex-1 text-left">
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: active.has(m.id) ? m.color : 'transparent', boxShadow: `inset 0 0 0 1px ${m.color}` }}
                        />
                        <span className={`truncate text-sm ${active.has(m.id) ? 'font-bold text-fg' : 'text-fg'}`}>
                          {m.title}
                        </span>
                      </span>
                      <span className="mt-0.5 block pl-4 text-[11px] text-fg-subtle">
                        {active.has(m.id) ? 'On the chart' : 'Built-in'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onFav(m.id)}
                      aria-label={favs.includes(m.id) ? 'Unstar' : 'Star'}
                      className="shrink-0 rounded-sm p-1 text-fg-subtle transition-colors hover:text-brand"
                    >
                      <Star className={`h-4 w-4 ${favs.includes(m.id) ? 'fill-current text-brand' : ''}`} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A small dropdown for the style toolbar: a button, and a panel under it. */
function DrawMenu({ label, align = 'left', children }: {
  label: React.ReactNode;
  align?: 'left' | 'right';
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-7 items-center gap-1 rounded-sm px-1.5 transition-colors ${
          open ? 'bg-brand/15 text-brand' : 'text-fg hover:bg-brand/10 hover:text-brand'
        }`}
      >
        {label}
        <ChevronDown className="h-3 w-3 text-fg-subtle" />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            className={`absolute top-[calc(100%+6px)] z-50 min-w-[9rem] overflow-hidden rounded-md border border-border bg-surface-raised py-1 shadow-xl ${
              align === 'right' ? 'right-0' : 'left-0'
            }`}
          >
            {children(() => setOpen(false))}
          </div>
        </>
      )}
    </div>
  );
}

/** A labelled dropdown in the chart's top bar. */
function TopMenu({ label, icon, children }: {
  label: string;
  icon?: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-sm transition-colors ${
          open ? 'bg-brand/10 text-brand' : 'text-fg hover:bg-brand/10 hover:text-brand'
        }`}
      >
        {icon}
        {label}
        <ChevronDown className="h-3.5 w-3.5 text-fg-subtle" />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Dismiss menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div className="absolute left-0 top-[calc(100%+4px)] z-40 w-40 overflow-hidden rounded-sm border border-border bg-surface-raised py-1 shadow-xl">
            {children(() => setOpen(false))}
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ active, disabled, title, onClick, children }: {
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`block w-full px-3 py-2 text-left text-sm transition-colors ${
        active ? 'bg-brand/15 font-semibold text-brand' : 'text-fg'
      } ${disabled ? 'cursor-not-allowed opacity-45' : 'hover:bg-brand/10 hover:text-brand'}`}
    >
      {children}
    </button>
  );
}

/** Vertical tool rail. Every button here does something — the mock's extra
 *  glyphs are left out rather than drawn dead. */
function RailBtn({ active, onClick, title, children }: {
  active?: boolean; onClick: () => void; title: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex h-9 w-9 items-center justify-center rounded-sm transition-colors ${
        active
          ? 'bg-brand/15 text-brand ring-1 ring-brand/40'
          : 'text-fg-muted hover:bg-brand/10 hover:text-brand'
      }`}
    >
      {children}
    </button>
  );
}

function ToolBtn({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${active ? 'bg-brand text-brand-fg' : 'text-fg-muted hover:text-fg hover:bg-surface-hover'}`}
    >
      {children}
    </button>
  );
}
