"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArcElement,
  Chart as ChartJS,
  Tooltip,
  type ChartOptions,
  type TooltipItem,
} from "chart.js";
import { Doughnut } from "react-chartjs-2";
import type { Composition } from "@/lib/admin/composition";

/**
 * A part-to-whole doughnut.
 *
 * DOUGHNUT RATHER THAN PIE, and the hole is not decoration: it holds the total,
 * which is the number a reader wants first and which a pie has nowhere to put.
 *
 * THE LEGEND CARRIES THE VALUES. Chart.js's own legend is off — it prints
 * labels only, so identity rests on colour alone, and the palette has pairs
 * that sit close together for a colourblind reader (the validated worst
 * adjacent pair is ΔE 8.4 protan on dark, 5.8 tritan on light). A legend with
 * the count and the share beside each swatch is the secondary encoding that
 * makes those pairs safe, and it is also just more useful.
 *
 * The slices are separated by a 2px surface-coloured border for the same
 * reason — two adjacent wedges never touch, so the boundary is a shape and not
 * only a hue change.
 */

ChartJS.register(ArcElement, Tooltip);

/**
 * The categorical palette, in fixed order.
 *
 * From the design-system reference, validated with its own script against both
 * of this app's surfaces:
 *
 *   dark  (#141414) — ALL CHECKS PASS, worst adjacent ΔE 8.4 protan
 *   light (#ffffff) — passes, with a contrast WARN on three steps that
 *                     obligates visible labels or a table view. Both ship.
 *
 * ASSIGNED IN ORDER, NEVER CYCLED. A ninth slice does not get a generated
 * hue — the data layer folds the tail into "Other" before it reaches here.
 */
const SERIES_DARK = [
  "#3987e5", "#d95926", "#199e70", "#c98500",
  "#d55181", "#008300", "#9085e9", "#e66767",
];

const SERIES_LIGHT = [
  "#2a78d6", "#eb6834", "#1baf7a", "#eda100",
  "#e87ba4", "#008300", "#6250d6", "#e34948",
];

/** Whether the document is currently in light mode. */
function useLightMode(): boolean {
  const [light, setLight] = useState(false);

  useEffect(() => {
    const read = () => {
      const attr = document.documentElement.getAttribute("data-theme");
      if (attr === "light") return setLight(true);
      if (attr === "dark") return setLight(false);
      // No override: the OS decides, and dark is this app's default.
      setLight(window.matchMedia("(prefers-color-scheme: light)").matches);
    };

    read();

    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const media = window.matchMedia("(prefers-color-scheme: light)");
    media.addEventListener("change", read);

    return () => {
      observer.disconnect();
      media.removeEventListener("change", read);
    };
  }, []);

  return light;
}

export function CompositionChart({
  title,
  note,
  composition,
  unit = "trades",
}: {
  title: string;
  note: string;
  composition: Composition;
  /** What the total counts, for the figure in the hole. */
  unit?: string;
}) {
  const light = useLightMode();
  const palette = light ? SERIES_LIGHT : SERIES_DARK;
  const surface = light ? "#ffffff" : "#141414";

  const { slices, total } = composition;

  const data = useMemo(
    () => ({
      labels: slices.map((slice) => slice.label),
      datasets: [
        {
          data: slices.map((slice) => slice.value),
          backgroundColor: slices.map((_, i) => palette[i % palette.length]),
          // A surface-coloured ring, so no two wedges share an edge.
          borderColor: surface,
          borderWidth: 2,
          hoverBorderColor: surface,
          hoverOffset: 6,
        },
      ],
    }),
    [slices, palette, surface],
  );

  const options = useMemo<ChartOptions<"doughnut">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      // Wide enough that the total fits inside it comfortably.
      cutout: "62%",
      plugins: {
        // Off deliberately — ours carries the numbers. See the note above.
        legend: { display: false },
        tooltip: {
          backgroundColor: surface,
          borderColor: light ? "#e5e5e5" : "#262626",
          borderWidth: 1,
          titleColor: light ? "#0a0a0a" : "#fafafa",
          bodyColor: light ? "#52525b" : "#a1a1aa",
          padding: 10,
          displayColors: false,
          callbacks: {
            title: (items: TooltipItem<"doughnut">[]) =>
              String(items[0]?.label ?? ""),
            label: (item: TooltipItem<"doughnut">) => {
              const slice = slices[item.dataIndex];
              if (!slice) return "";
              return `${slice.value} of ${total} · ${(slice.share * 100).toFixed(1)}%`;
            },
          },
        },
      },
    }),
    [slices, total, surface, light],
  );

  return (
    <section className="surface rounded-xl border border-border p-5">
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{note}</p>

      {slices.length === 0 ? (
        <p className="py-12 text-center text-sm text-fg-muted">
          Nothing to break down yet.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {/* THE LEGEND SITS BELOW, always.
              It was beside the doughnut under `sm:flex-row`, which looked
              right in isolation and wrong on the page: these cards sit in a
              three-column grid, so the card is narrow while the VIEWPORT is
              wide — and a viewport breakpoint cannot see that. Every label
              truncated to "Sto…", "Tak…", "Pro…", which defeats the one job
              the legend has. Stacked, each label gets the full card width. */}
          <div className="relative h-40 w-40 shrink-0 self-center">
            <Doughnut
              data={data}
              options={options}
              aria-label={`${title}. ${slices
                .map(
                  (slice) =>
                    `${slice.label} ${slice.value}, ${(slice.share * 100).toFixed(0)} percent`,
                )
                .join(". ")}`}
              role="img"
            />
            {/* The total, in the hole. pointer-events-none so it never steals
                a hover from the wedge underneath it. */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold tabular-nums">{total}</span>
              <span className="text-[11px] text-fg-muted">{unit}</span>
            </div>
          </div>

          {/* The legend — and the table view, in one. Values beside swatches,
              so identity never rests on colour alone. */}
          <ul className="min-w-0 space-y-1.5">
            {slices.map((slice, i) => (
              <li
                key={slice.label}
                className="flex items-center gap-2.5 text-xs"
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: palette[i % palette.length] }}
                />
                <span className="min-w-0 flex-1 truncate" title={slice.label}>
                  {slice.label}
                </span>
                <span className="shrink-0 tabular-nums text-fg-muted">
                  {slice.value}
                </span>
                <span className="w-14 shrink-0 text-right font-medium tabular-nums">
                  {(slice.share * 100).toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
