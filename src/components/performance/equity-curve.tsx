"use client";

import { useId, useMemo, useState } from "react";
import type { EquityPoint } from "@/lib/performance";

/**
 * P2-401 — the equity curve.
 *
 * Inline SVG rather than a charting library: one series, one axis, no legend
 * needed (the heading names it). A 45kb dependency to draw a polyline would be
 * the tail wagging the dog, and it would bring its own colours to override.
 *
 * Drawn in --chart-line so it follows the theme and P2-003's eventual decision
 * without touching this file.
 */

const VIEW_W = 900;
const VIEW_H = 280;
const PAD = { top: 16, right: 16, bottom: 28, left: 56 };

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const start = Math.ceil(min / step) * step;

  const ticks: number[] = [];
  for (let v = start; v <= max; v += step) ticks.push(v);
  return ticks;
}

export function EquityCurve({ points }: { points: EquityPoint[] }) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const { path, area, xs, ys, min, max, plotW, plotH } = useMemo(() => {
    const values = points.map((p) => p.equity);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    // Pad the range so the line never sits on the frame.
    const pad = (hi - lo) * 0.08 || 1;
    const min = lo - pad;
    const max = hi + pad;

    const plotW = VIEW_W - PAD.left - PAD.right;
    const plotH = VIEW_H - PAD.top - PAD.bottom;

    const xs = points.map(
      (_, i) => PAD.left + (i / Math.max(points.length - 1, 1)) * plotW,
    );
    const ys = points.map(
      (p) => PAD.top + plotH - ((p.equity - min) / (max - min)) * plotH,
    );

    const path = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x} ${ys[i]}`).join(" ");
    const area = `${path} L${xs[xs.length - 1]} ${PAD.top + plotH} L${xs[0]} ${
      PAD.top + plotH
    } Z`;

    return { path, area, xs, ys, min, max, plotW, plotH };
  }, [points]);

  const ticks = niceTicks(min, max);
  const active = hover === null ? null : points[hover];

  /** Nearest point to the pointer, in view coordinates. */
  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * VIEW_W;
    const ratio = (x - PAD.left) / plotW;
    const index = Math.round(ratio * (points.length - 1));
    setHover(Math.min(Math.max(index, 0), points.length - 1));
  }

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full touch-none"
        role="img"
        aria-label={`Account equity from ${points[0]?.t} to ${
          points[points.length - 1]?.t
        }`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-line)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--chart-line)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Recessive grid: present enough to read a value off, quiet enough
            that the line is what you see. */}
        {ticks.map((v) => {
          const y = PAD.top + plotH - ((v - min) / (max - min)) * plotH;
          return (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={VIEW_W - PAD.right}
                y1={y}
                y2={y}
                stroke="var(--chart-grid)"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 10}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--fg-muted)"
              >
                {v.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </text>
            </g>
          );
        })}

        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={path}
          fill="none"
          stroke="var(--chart-line)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {active && hover !== null ? (
          <g>
            <line
              x1={xs[hover]}
              x2={xs[hover]}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke="var(--fg-muted)"
              strokeWidth="1"
            />
            {/* Surface ring so the marker reads against the line it sits on. */}
            <circle
              cx={xs[hover]}
              cy={ys[hover]}
              r="5"
              fill="var(--chart-line)"
              stroke="var(--surface)"
              strokeWidth="2"
            />
          </g>
        ) : null}

        <text
          x={PAD.left}
          y={VIEW_H - 8}
          fontSize="11"
          fill="var(--fg-muted)"
        >
          {points[0]?.t}
        </text>
        <text
          x={VIEW_W - PAD.right}
          y={VIEW_H - 8}
          textAnchor="end"
          fontSize="11"
          fill="var(--fg-muted)"
        >
          {points[points.length - 1]?.t}
        </text>
      </svg>

      {/* The tooltip is live text, not an SVG overlay, so a screen reader and a
          keyboard user get the same value a pointer user does. */}
      <figcaption
        aria-live="polite"
        className="mt-2 min-h-5 text-xs tabular-nums text-fg-muted"
      >
        {active
          ? `${active.t} — ${active.equity.toLocaleString("en-US")}`
          : "Hover the chart to read a value."}
      </figcaption>
    </figure>
  );
}
