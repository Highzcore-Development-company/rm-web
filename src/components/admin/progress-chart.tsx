"use client";

import { useMemo, useState } from "react";
import type { Granularity, ProgressPoint } from "@/lib/admin/progress";

/**
 * Progress over time — bars for each bucket, a line for the running total.
 *
 * Victor: "a chart of our progress fully details on months, weeks and days of
 * progress performance."
 *
 * BOTH SERIES ON ONE AXIS PAIR, on purpose. The bars answer "how did we do
 * that week" and the line answers "where are we now", and either alone invites
 * the wrong reading: a run of small green bars looks like progress until the
 * line shows it has not recovered the drawdown before it.
 *
 * Hand-drawn SVG rather than a charting library. lightweight-charts is already
 * a dependency but it draws price series — candles, time axis, crosshair —
 * and this is a bucketed bar chart with a second scale. Bending it into that
 * shape is more code than 120 lines of SVG, and this way the figures and the
 * axis come from the same array with nothing in between to misconfigure.
 *
 * ZERO IS ALWAYS ON THE SCALE. A P&L chart whose axis starts at the minimum
 * makes a losing month look like a rising one.
 */

const TABS: { key: Granularity; label: string }[] = [
  { key: "day", label: "Days" },
  { key: "week", label: "Weeks" },
  { key: "month", label: "Months" },
];

export function ProgressChart({
  series,
  initial = "day",
}: {
  series: Record<Granularity, ProgressPoint[]>;
  initial?: Granularity;
}) {
  const [granularity, setGranularity] = useState<Granularity>(initial);
  const points = series[granularity];

  return (
    <section className="surface rounded-xl border border-border p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Progress</h2>
          <p className="mt-0.5 text-xs text-fg-muted">
            Result per {granularity}, and the running total. Net of commission
            and swap.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Chart granularity"
          className="flex rounded-lg border border-border p-0.5"
        >
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={granularity === tab.key}
              onClick={() => setGranularity(tab.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                granularity === tab.key
                  ? "bg-accent/15 text-accent"
                  : "text-fg-muted hover:text-fg"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {points.length === 0 ? (
        <p className="py-12 text-center text-sm text-fg-muted">
          No closed trades yet.
        </p>
      ) : (
        <Plot points={points} />
      )}
    </section>
  );
}

const WIDTH = 960;
const HEIGHT = 260;
const PAD = { top: 16, right: 56, bottom: 28, left: 56 };

function Plot({ points }: { points: ProgressPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const geometry = useMemo(() => {
    const plotW = WIDTH - PAD.left - PAD.right;
    const plotH = HEIGHT - PAD.top - PAD.bottom;

    // Separate scales: the bars are per-bucket and the line is cumulative, and
    // on a young account the cumulative total dwarfs any single bucket. One
    // shared scale would flatten the bars to invisibility.
    const barMax = Math.max(...points.map((p) => Math.abs(p.net)), 1);
    const lineValues = points.map((p) => p.cumulative);
    // Zero pinned into both ends, so the line never floats off a scale that
    // excludes its own baseline.
    const lineMin = Math.min(...lineValues, 0);
    const lineMax = Math.max(...lineValues, 0);
    const lineSpan = lineMax - lineMin || 1;

    const step = plotW / points.length;
    // Breathing room between bars, and never thinner than a hairline — at 200
    // daily buckets the gap would otherwise consume the bar entirely.
    const barW = Math.max(Math.min(step * 0.62, 28), 1);

    const zeroY = PAD.top + plotH / 2;

    const bars = points.map((point, i) => {
      const x = PAD.left + step * i + (step - barW) / 2;
      // Half the plot height each way from the centre line.
      const h = (Math.abs(point.net) / barMax) * (plotH / 2);
      return {
        x,
        y: point.net >= 0 ? zeroY - h : zeroY,
        width: barW,
        height: Math.max(h, point.net === 0 ? 0 : 1),
        up: point.net >= 0,
        centre: PAD.left + step * i + step / 2,
      };
    });

    const line = points.map((point, i) => ({
      x: PAD.left + step * i + step / 2,
      y:
        PAD.top +
        plotH -
        ((point.cumulative - lineMin) / lineSpan) * plotH,
    }));

    return { bars, line, step, zeroY, plotH, lineMin, lineMax, barMax };
  }, [points]);

  const { bars, line, step, zeroY, lineMin, lineMax, barMax } = geometry;

  const path = line
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");

  // Not every label fits. One in N, chosen from the count, so a 200-day series
  // prints about a dozen dates rather than an unreadable smear.
  const labelEvery = Math.max(Math.ceil(points.length / 12), 1);

  const active = hover === null ? null : points[hover];

  return (
    <div className="mt-4">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        style={{ height: HEIGHT }}
        role="img"
        aria-label={`Progress over ${points.length} buckets. Running total ${fmt(
          points[points.length - 1].cumulative,
        )}.`}
        onMouseLeave={() => setHover(null)}
      >
        {/* The zero line for the bars. Solid, because it is the thing every
            bar is measured against. */}
        <line
          x1={PAD.left}
          x2={WIDTH - PAD.right}
          y1={zeroY}
          y2={zeroY}
          className="stroke-border"
          strokeWidth={1}
        />

        {/* Bar scale, left. Only the extreme and zero: a per-bucket axis with
            five gridlines competes with the cumulative line for attention. */}
        <text x={8} y={PAD.top + 4} className="fill-current text-[10px] opacity-50">
          {fmt(barMax)}
        </text>
        <text x={8} y={zeroY + 3} className="fill-current text-[10px] opacity-50">
          0
        </text>
        <text
          x={8}
          y={HEIGHT - PAD.bottom}
          className="fill-current text-[10px] opacity-50"
        >
          {fmt(-barMax)}
        </text>

        {bars.map((bar, i) => (
          <rect
            key={points[i].key}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            rx={Math.min(2, bar.width / 2)}
            className={bar.up ? "fill-chart-up" : "fill-chart-down"}
            opacity={hover === null || hover === i ? 0.85 : 0.35}
          />
        ))}

        {/* The cumulative line, over the bars. */}
        <path
          d={path}
          fill="none"
          className="stroke-accent"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Cumulative scale, right. */}
        <text
          x={WIDTH - PAD.right + 8}
          y={PAD.top + 4}
          className="fill-current text-[10px] opacity-50"
        >
          {fmt(lineMax)}
        </text>
        <text
          x={WIDTH - PAD.right + 8}
          y={HEIGHT - PAD.bottom}
          className="fill-current text-[10px] opacity-50"
        >
          {fmt(lineMin)}
        </text>

        {hover !== null ? (
          <>
            <line
              x1={bars[hover].centre}
              x2={bars[hover].centre}
              y1={PAD.top}
              y2={HEIGHT - PAD.bottom}
              className="stroke-fg"
              strokeWidth={1}
              opacity={0.25}
            />
            <circle
              cx={line[hover].x}
              cy={line[hover].y}
              r={3.5}
              className="fill-accent"
            />
          </>
        ) : null}

        {points.map((point, i) =>
          i % labelEvery === 0 ? (
            <text
              key={`label-${point.key}`}
              x={PAD.left + step * i + step / 2}
              y={HEIGHT - 8}
              textAnchor="middle"
              className="fill-current text-[10px] opacity-50"
            >
              {point.label}
            </text>
          ) : null,
        )}

        {/* Hover targets last, so they sit above everything and the whole
            column is grabbable rather than just the bar — a flat bucket has a
            1px bar and would otherwise be impossible to hit. */}
        {points.map((point, i) => (
          <rect
            key={`hit-${point.key}`}
            x={PAD.left + step * i}
            y={PAD.top}
            width={step}
            height={HEIGHT - PAD.top - PAD.bottom}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>

      {/* The readout, under the chart rather than floating over it. An SVG
          tooltip that follows the cursor is a lot of positioning code to put
          the number somewhere it can cover the bar it describes. */}
      <div className="mt-2 flex min-h-[2.5rem] flex-wrap items-center gap-x-6 gap-y-1 border-t border-border pt-2 text-xs">
        {active ? (
          <>
            <span className="font-medium">{active.label}</span>
            <span className="text-fg-muted">
              Result{" "}
              <span
                className={`font-medium tabular-nums ${
                  active.net > 0
                    ? "text-chart-up"
                    : active.net < 0
                      ? "text-chart-down"
                      : ""
                }`}
              >
                {fmt(active.net)}
              </span>
            </span>
            <span className="text-fg-muted">
              Running{" "}
              <span className="font-medium tabular-nums text-accent">
                {fmt(active.cumulative)}
              </span>
            </span>
            <span className="text-fg-muted tabular-nums">
              {active.trades} trade{active.trades === 1 ? "" : "s"}
              {active.trades > 0 ? ` · ${active.wins}W / ${active.losses}L` : ""}
            </span>
          </>
        ) : (
          <span className="text-fg-subtle">
            Hover a bar for that {points.length > 0 ? "period" : "bucket"}.
            Bars are the period&rsquo;s result; the line is the running total.
          </span>
        )}
      </div>
    </div>
  );
}

/** Signed and compact. The axis has no room for "$1,234.56". */
function fmt(value: number): string {
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  if (abs >= 100) return `${sign}$${abs.toFixed(0)}`;
  return `${sign}$${abs.toFixed(2)}`;
}
