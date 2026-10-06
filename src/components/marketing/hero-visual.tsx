"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useId } from "react";

/**
 * The hero graphic.
 *
 * DELIBERATELY ABSTRACT. No axes, no numbers, no dates — it is a shape, not a
 * chart. An illustrative equity curve on the landing page of a trading product
 * would read as a performance claim, and we do not have a record to claim yet
 * (the brief is explicit: do not sell before the gate).
 *
 * So it earns its place by suggesting motion and activity without asserting a
 * single figure.
 */

const LINE =
  "M0 150 C 60 140, 90 110, 140 118 S 210 150, 260 112 S 330 70, 390 88 S 460 60, 520 34";

export function HeroVisual() {
  const gradient = useId();
  const fade = useId();
  const reduced = useReducedMotion();

  return (
    <div className="pointer-events-none relative select-none">
      <svg
        viewBox="0 0 520 200"
        className="w-full"
        role="presentation"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="1" />
          </linearGradient>
          <linearGradient id={fade} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Recessive grid. Enough to read as a plotted surface, quiet enough
            that it never competes with the line. */}
        {[40, 80, 120, 160].map((y) => (
          <line
            key={y}
            x1="0"
            x2="520"
            y1={y}
            y2={y}
            stroke="var(--border)"
            strokeWidth="1"
          />
        ))}

        <motion.path
          d={`${LINE} L 520 200 L 0 200 Z`}
          fill={`url(#${fade})`}
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.6 }}
        />

        {/* Draws itself in. pathLength normalises the path to 0–1 so this works
            without measuring the geometry by hand. */}
        <motion.path
          d={LINE}
          fill="none"
          stroke={`url(#${gradient})`}
          strokeWidth="2.5"
          strokeLinecap="round"
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
        />

        {/* The leading point, with a slow pulse: the one element that says
            "this is still running" rather than "this is a picture". */}
        <motion.circle
          cx="520"
          cy="34"
          r="5"
          fill="var(--accent)"
          initial={reduced ? false : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 1.5, type: "spring", stiffness: 300 }}
        />
        {reduced ? null : (
          <motion.circle
            cx="520"
            cy="34"
            r="5"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.5"
            initial={{ scale: 1, opacity: 0.8 }}
            animate={{ scale: 3.2, opacity: 0 }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              ease: "easeOut",
              delay: 1.8,
            }}
          />
        )}
      </svg>
    </div>
  );
}
