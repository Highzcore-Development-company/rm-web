import type { ReactNode } from "react";

/**
 * The section heading, ported from highscore-tech-web's `SectionHeading`.
 *
 * WHAT MAKES IT THEIRS IS THE TYPE, not the colour. Three things:
 *
 *   - a wide-tracked uppercase eyebrow (0.18em), which is what gives the
 *     agency site its composed feel
 *   - a display heading that is genuinely large and NEGATIVELY tracked
 *     (-0.025em) with tight leading, so it reads as one block rather than
 *     three lines
 *   - the description held to a readable measure under it
 *
 * Their eyebrow is `text-brand`; ours is `text-accent`. That is the whole
 * substitution Esther asked for — take the design, leave the colour.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className = "",
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={`${
        align === "center" ? "mx-auto max-w-[760px] text-center" : "max-w-2xl"
      } ${className}`}
    >
      {eyebrow ? (
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="display text-3xl font-bold leading-[1.08] tracking-[-0.025em] sm:text-4xl md:text-5xl md:leading-[1.05]">
        {title}
      </h2>
      {description ? (
        <p className="mt-3 text-base leading-relaxed text-fg-muted sm:text-lg md:mt-4">
          {description}
        </p>
      ) : null}
    </div>
  );
}
