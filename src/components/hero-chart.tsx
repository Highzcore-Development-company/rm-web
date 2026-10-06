"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * A candlestick chart that draws itself: candles rise from the baseline in
 * sequence, then a trendline traces across them and a price marker settles.
 *
 * Why this rather than a stock illustration — it is the product. Someone lands
 * on the page and sees the thing the bot actually does, in the brand colours,
 * without a screenshot that will be stale in a week.
 *
 * The data is a FIXED array, not random. Math.random() during render produces
 * different candles on the server and the client, so React throws a hydration
 * mismatch and the chart flashes as it corrects. Deterministic data also means
 * the shape is art-directed rather than occasionally ugly.
 */

type Candle = { o: number; h: number; l: number; c: number };

// Hand-tuned: a pullback, a base, then a run. Reads as a real chart, and the
// shape matches the copy — the trend the bot is built to follow.
const CANDLES: Candle[] = [
  { o: 52, h: 58, l: 49, c: 55 },
  { o: 55, h: 57, l: 46, c: 48 },
  { o: 48, h: 51, l: 41, c: 43 },
  { o: 43, h: 46, l: 36, c: 38 },
  { o: 38, h: 44, l: 36, c: 42 },
  { o: 42, h: 45, l: 38, c: 40 },
  { o: 40, h: 43, l: 34, c: 36 },
  { o: 36, h: 41, l: 35, c: 40 },
  { o: 40, h: 48, l: 39, c: 47 },
  { o: 47, h: 52, l: 45, c: 51 },
  { o: 51, h: 54, l: 47, c: 49 },
  { o: 49, h: 58, l: 48, c: 57 },
  { o: 57, h: 63, l: 55, c: 61 },
  { o: 61, h: 64, l: 57, c: 59 },
  { o: 59, h: 68, l: 58, c: 67 },
  { o: 67, h: 74, l: 65, c: 72 },
  { o: 72, h: 76, l: 68, c: 70 },
  { o: 70, h: 80, l: 69, c: 78 },
  { o: 78, h: 84, l: 75, c: 82 },
  { o: 82, h: 90, l: 80, c: 88 },
];

const W = 560;
const H = 260;
const PAD = 12;
const SLOT = (W - PAD * 2) / CANDLES.length;
const BODY = SLOT * 0.56;

const lo = Math.min(...CANDLES.map((c) => c.l)) - 4;
const hi = Math.max(...CANDLES.map((c) => c.h)) + 4;
const y = (v: number) => H - PAD - ((v - lo) / (hi - lo)) * (H - PAD * 2);
const x = (i: number) => PAD + i * SLOT + SLOT / 2;

const UP = "#FFB020";
const DOWN = "#52525B";

/** Closing prices as a path, for the trendline that traces over the candles. */
const TREND = CANDLES.map((c, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(c.c)}`).join(" ");

export function HeroChart({ className = "" }: { className?: string }) {
  const reduced = useReducedMotion();
  const last = CANDLES[CANDLES.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`h-auto w-full ${className}`}
      role="img"
      aria-label="An illustrative price chart showing a downtrend, a base, and a sustained rise."
    >
      <defs>
        <linearGradient id="hc-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={UP} stopOpacity="0.22" />
          <stop offset="100%" stopColor={UP} stopOpacity="0" />
        </linearGradient>
        <filter id="hc-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Baseline the candles grow from. */}
      <line
        x1={PAD}
        y1={H - PAD}
        x2={W - PAD}
        y2={H - PAD}
        stroke="var(--border)"
        strokeWidth="1"
      />

      {CANDLES.map((c, i) => {
        const up = c.c >= c.o;
        const colour = up ? UP : DOWN;
        const top = y(Math.max(c.o, c.c));
        const height = Math.max(Math.abs(y(c.o) - y(c.c)), 2);
        // Each candle lands just after the one before it, so the chart builds
        // left to right the way a real one does.
        const delay = reduced ? 0 : 0.35 + i * 0.045;

        return (
          <motion.g
            key={i}
            initial={reduced ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
          >
            <line
              x1={x(i)}
              y1={y(c.h)}
              x2={x(i)}
              y2={y(c.l)}
              stroke={colour}
              strokeWidth="1.5"
              opacity={up ? 0.85 : 0.5}
            />
            <rect
              x={x(i) - BODY / 2}
              y={top}
              width={BODY}
              height={height}
              rx="1.5"
              fill={colour}
              opacity={up ? 0.95 : 0.45}
            />
          </motion.g>
        );
      })}

      {/* Trendline, drawn by animating the dash offset — the one reliable way
          to make an SVG path look hand-drawn. */}
      <motion.path
        d={TREND}
        fill="none"
        stroke={UP}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#hc-glow)"
        initial={reduced ? false : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 0.9 }}
        transition={{ duration: 1.6, delay: reduced ? 0 : 1.1, ease: "easeInOut" }}
      />

      <motion.path
        d={`${TREND} L ${x(CANDLES.length - 1)} ${H - PAD} L ${x(0)} ${H - PAD} Z`}
        fill="url(#hc-fill)"
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.9, delay: reduced ? 0 : 2.2 }}
      />

      {/* The live marker. The pulse is the only thing that keeps moving once
          the chart has drawn — enough to read as live, little enough to ignore. */}
      <motion.g
        initial={reduced ? false : { opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: reduced ? 0 : 2.5 }}
      >
        {!reduced && (
          <motion.circle
            cx={x(CANDLES.length - 1)}
            cy={y(last.c)}
            r="4"
            fill={UP}
            animate={{ r: [4, 13], opacity: [0.55, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <circle cx={x(CANDLES.length - 1)} cy={y(last.c)} r="4" fill={UP} />
      </motion.g>
    </svg>
  );
}
