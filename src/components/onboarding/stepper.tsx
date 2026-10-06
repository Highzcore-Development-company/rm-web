"use client";

import { motion } from "framer-motion";

export type StepperSegment = {
  key: string;
  label: string;
  done: boolean;
  /** False when we have no way to confirm it — the funding step. */
  verifiable: boolean;
  current: boolean;
};

/**
 * The progress bar, one segment per stage.
 *
 * Segments rather than a single bar because the stages are discrete: a bar at
 * 62% invites "62% of what?", while four blocks say which stage you are on
 * without a number at all.
 *
 * Green means done, accent means you are here, grey means not yet — and each
 * carries a label, because colour alone is unreadable to a red/green
 * colourblind reader and this screen decides whether money gets traded.
 */
export function Stepper({ segments }: { segments: StepperSegment[] }) {
  return (
    <ol className="flex gap-2">
      {segments.map((segment, index) => (
        <li key={segment.key} className="min-w-0 flex-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-border">
            <motion.div
              className={`h-full rounded-full ${
                segment.done
                  ? "bg-chart-up shadow-[0_0_10px_rgb(34_197_94/0.5)]"
                  : segment.current
                    ? "bg-accent shadow-[0_0_10px_var(--accent)]"
                    : "bg-transparent"
              }`}
              initial={{ width: 0 }}
              animate={{
                // A current-but-unfinished stage shows a stub, so "you are
                // here" is visible without claiming progress that has not
                // happened.
                width: segment.done ? "100%" : segment.current ? "35%" : "0%",
              }}
              transition={{
                duration: 0.6,
                delay: index * 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
            />
          </div>
          <p
            className={`mt-2 truncate text-xs ${
              segment.done
                ? "text-chart-up"
                : segment.current
                  ? "text-fg"
                  : "text-fg-muted"
            }`}
          >
            {segment.label}
          </p>
        </li>
      ))}
    </ol>
  );
}
