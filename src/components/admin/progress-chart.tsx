"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartOptions,
  type TooltipItem,
} from "chart.js";
import { Line } from "react-chartjs-2";
import type { Granularity, ProgressPoint } from "@/lib/admin/progress";

/**
 * Progress over time.
 *
 * ONE SERIES, ONE AXIS: the running total. Victor asked for a progress graph,
 * and the first version was not one — it drew a bar per period against a left
 * scale AND the cumulative line against a right scale. Two y-scales on one plot
 * is the single worst chart mistake there is: the two scales are chosen
 * independently, so where the bars appear to cross the line means nothing at
 * all, and the reader cannot tell. It also made the thing read as a candle
 * chart, which is what he actually said.
 *
 * The per-period result did not disappear — it moved into the tooltip, where it
 * belongs. "What did we make that day" is a question about ONE day, asked by
 * pointing at it; it was never worth a second scale across the whole plot.
 *
 * Chart.js, per his request. Registered piecemeal rather than with the `auto`
 * bundle so the bars, pies, radars and the rest of it stay out of the client
 * bundle — this page only draws a line.
 *
 * THE COLOURS COME FROM THE STYLESHEET, read at runtime. The app's theme is
 * dark by default, light by override, and Chart.js paints to a canvas, where a
 * CSS variable in a colour string does not resolve. Hardcoding hex would have
 * given a chart that only matched one of the two themes — so the tokens are
 * read off the document and the chart is rebuilt when the theme changes.
 */

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
);

const TABS: { key: Granularity; label: string }[] = [
  { key: "day", label: "Days" },
  { key: "week", label: "Weeks" },
  { key: "month", label: "Months" },
];

type Theme = {
  accent: string;
  fg: string;
  fgMuted: string;
  grid: string;
  surface: string;
  up: string;
  down: string;
};

const FALLBACK: Theme = {
  accent: "#ffb020",
  fg: "#fafafa",
  fgMuted: "#a1a1aa",
  grid: "#262626",
  surface: "#141414",
  up: "#22c55e",
  down: "#ef4444",
};

/** Reads the design tokens, and re-reads them whenever the theme flips. */
function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(FALLBACK);

  useEffect(() => {
    const read = () => {
      const style = getComputedStyle(document.documentElement);
      const token = (name: string, fallback: string) =>
        style.getPropertyValue(name).trim() || fallback;

      setTheme({
        accent: token("--accent", FALLBACK.accent),
        fg: token("--fg", FALLBACK.fg),
        fgMuted: token("--fg-muted", FALLBACK.fgMuted),
        grid: token("--chart-grid", FALLBACK.grid),
        surface: token("--surface", FALLBACK.surface),
        up: token("--chart-up", FALLBACK.up),
        down: token("--chart-down", FALLBACK.down),
      });
    };

    read();

    // The toggle writes data-theme on <html>; the OS preference is the
    // fallback. Both have to be watched or the chart keeps the colours it was
    // born with.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", read);

    return () => {
      observer.disconnect();
      media.removeEventListener("change", read);
    };
  }, []);

  return theme;
}

export function ProgressChart({
  series,
  initial = "day",
}: {
  series: Record<Granularity, ProgressPoint[]>;
  initial?: Granularity;
}) {
  const [granularity, setGranularity] = useState<Granularity>(initial);
  const points = series[granularity];
  const theme = useTheme();

  const latest = points.at(-1) ?? null;

  return (
    <section className="surface rounded-xl border border-border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Progress</h2>
          {/* A single series needs no legend box — the subtitle names it. */}
          <p className="mt-0.5 text-xs text-fg-muted">
            Running total since the first trade, by {granularity}. Net of
            commission and swap.
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
        <p className="py-16 text-center text-sm text-fg-muted">
          No closed trades yet.
        </p>
      ) : (
        <>
          {/* The headline, as a figure rather than as a label on the last
              point — it is the number the section exists to report. */}
          {latest ? (
            <p className="mt-4 flex items-baseline gap-2">
              <span
                className="text-3xl font-semibold tabular-nums"
                style={{
                  color:
                    latest.cumulative > 0
                      ? theme.up
                      : latest.cumulative < 0
                        ? theme.down
                        : theme.fg,
                }}
              >
                {signed(latest.cumulative)}
              </span>
              <span className="text-xs text-fg-muted">
                as of {latest.label}
              </span>
            </p>
          ) : null}

          <Plot points={points} theme={theme} granularity={granularity} />

          {/* The table view. Required for anyone who cannot read the plot, and
              useful to everybody when a figure needs to be copied. */}
          <details className="mt-3 border-t border-border pt-3">
            <summary className="cursor-pointer text-xs text-fg-muted hover:text-fg">
              Show the figures
            </summary>
            <div className="mt-3 max-h-72 overflow-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-border uppercase tracking-wide text-fg-muted">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {granularity === "month" ? "Month" : "Starting"}
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">
                      Result
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">
                      Running total
                    </th>
                    <th scope="col" className="py-2 text-right font-medium">
                      Trades
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {points
                    .slice()
                    .reverse()
                    .map((point) => (
                      <tr key={point.key}>
                        <th scope="row" className="py-2 pr-4 font-normal tabular-nums">
                          {point.label}
                        </th>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {point.trades === 0 ? (
                            <span className="text-fg-subtle">—</span>
                          ) : (
                            signed(point.net)
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {signed(point.cumulative)}
                        </td>
                        <td className="py-2 text-right tabular-nums text-fg-muted">
                          {point.trades === 0 ? "—" : point.trades}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}

function Plot({
  points,
  theme,
  granularity,
}: {
  points: ProgressPoint[];
  theme: Theme;
  granularity: Granularity;
}) {
  // Chart.js mutates the objects it is handed, so the dataset is rebuilt rather
  // than mutated — and keyed on the theme so a theme flip repaints it.
  const data = useMemo(
    () => ({
      labels: points.map((point) => point.label),
      datasets: [
        {
          label: "Running total",
          data: points.map((point) => point.cumulative),
          borderColor: theme.accent,
          borderWidth: 2,
          // Filled to the zero line, not to the bottom of the plot: the area
          // then reads as "distance from break-even", which is the quantity,
          // and a run below zero fills downward instead of looking like a
          // smaller gain.
          fill: { target: { value: 0 }, above: hexToRgba(theme.accent, 0.14), below: hexToRgba(theme.down, 0.14) },
          // No marker on every point — at 200 days that is a smear. The hover
          // point is the marker, and it is big enough to see.
          //
          // EXCEPT WHEN THERE IS ONE POINT. A line needs two ends, so a single
          // bucket drew an empty plot with gridlines and nothing in it — which
          // is exactly what Months looked like in the first live month. One
          // point gets drawn as a point.
          pointRadius: points.length === 1 ? 5 : 0,
          pointHoverRadius: 5,
          pointHoverBorderWidth: 2,
          pointHoverBackgroundColor: theme.accent,
          // A surface-coloured ring, so the hover point reads as sitting on
          // top of the line rather than merging into it.
          pointHoverBorderColor: theme.surface,
          tension: 0.25,
          clip: 8 as const,
        },
      ],
    }),
    [points, theme],
  );

  const options = useMemo<ChartOptions<"line">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      // The whole column is the hit target, so a flat stretch of the line is
      // still hoverable — and only one point can be nearest, so the tooltip
      // never reports two.
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: theme.surface,
          borderColor: theme.grid,
          borderWidth: 1,
          titleColor: theme.fg,
          bodyColor: theme.fgMuted,
          padding: 10,
          displayColors: false,
          callbacks: {
            title: (items: TooltipItem<"line">[]) => {
              const point = points[items[0]?.dataIndex ?? 0];
              return point ? point.label : "";
            },
            // The period's OWN result, which used to need a second axis and
            // now needs a sentence.
            label: (item: TooltipItem<"line">) => {
              const point = points[item.dataIndex];
              if (!point) return "";
              const lines = [`Running total ${signed(point.cumulative)}`];
              if (point.trades === 0) {
                lines.push(`No trades closed this ${granularity}`);
              } else {
                lines.push(`This ${granularity} ${signed(point.net)}`);
                lines.push(
                  `${point.trades} trade${point.trades === 1 ? "" : "s"} · ${point.wins}W / ${point.losses}L`,
                );
              }
              return lines;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: theme.grid },
          ticks: {
            color: theme.fgMuted,
            font: { size: 10 },
            maxRotation: 0,
            autoSkip: true,
            // Chart.js drops labels itself rather than overlapping them.
            maxTicksLimit: 12,
          },
        },
        y: {
          // ZERO IS ALWAYS ON THE SCALE. A progress chart whose axis starts at
          // the minimum makes a losing run look like a rising one.
          suggestedMin: 0,
          suggestedMax: 0,
          grid: { color: theme.grid, drawTicks: false },
          border: { display: false },
          ticks: {
            color: theme.fgMuted,
            font: { size: 10 },
            padding: 8,
            maxTicksLimit: 6,
            callback: (value: string | number) => compact(Number(value)),
          },
        },
      },
    }),
    [points, theme, granularity],
  );

  const summary =
    points.length === 1
      ? `Running total for ${points[0].label}: ${signed(points[0].cumulative)}.`
      : `Running total from ${points[0]?.label} to ${
          points.at(-1)?.label
        }, ending at ${signed(points.at(-1)?.cumulative ?? 0)}.`;

  return (
    <div className="mt-4 h-64 sm:h-72">
      <Line data={data} options={options} aria-label={summary} role="img" />
    </div>
  );
}

/** Signed, always — the minus is written, never implied by colour alone. */
function signed(value: number): string {
  const sign = value < 0 ? "−" : value > 0 ? "+" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

/**
 * Axis labels have no room for "$1,234.56".
 *
 * ONE FORMAT PER AXIS. An earlier version switched to whole dollars above $10,
 * so the same axis read "$5.00, $0.00, −$5.00, −$10" — three decimals-places
 * conventions in four labels, which looks like a rendering fault. Below a
 * thousand everything now gets two places; above it, thousands.
 */
function compact(value: number): string {
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

/**
 * Canvas needs a real colour, and the tokens are hex.
 *
 * Falls back to the string untouched if it is not hex — a token defined as
 * `oklch(...)` or `rgb(...)` is already something canvas accepts, and
 * mangling it would paint nothing at all.
 */
function hexToRgba(hex: string, alpha: number): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;
  const int = Number.parseInt(match[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
