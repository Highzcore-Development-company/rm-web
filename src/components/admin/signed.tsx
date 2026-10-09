import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

/**
 * A signed money figure.
 *
 * Colour is REINFORCEMENT, never the fact. Measured on this palette, the up
 * and down colours separate by ΔE 5.0 under deuteranopia — below the usable
 * floor — so roughly one man in twelve would read a loss as a gain if the
 * colour carried it alone. The sign is in the text and an arrow repeats it.
 *
 * Exactly zero gets neither arrow nor colour: a scratch result is not a small
 * win, and showing it as one flatters the figure.
 */
export function Signed({
  value,
  format,
}: {
  value: number;
  format: (n: number) => string;
}) {
  if (value === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-fg-muted">
        <Minus className="size-3.5" aria-hidden="true" />
        {format(0)}
      </span>
    );
  }

  const up = value > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={`inline-flex items-center gap-1 ${
        up ? "text-chart-up" : "text-chart-down"
      }`}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {/* The minus is written, not implied by colour. */}
      {up ? "+" : "−"}
      {format(value)}
    </span>
  );
}
