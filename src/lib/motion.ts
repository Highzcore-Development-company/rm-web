import type { Transition, Variants } from "framer-motion";

/**
 * P2-006 — the animation layer.
 *
 * Every motion in the product comes from this file. Nothing re-invents an
 * easing curve or a duration per page: if the feel of the site needs to
 * change, it changes here once.
 *
 * Reduced motion is handled by <MotionProvider> (reducedMotion="user"), which
 * strips transforms globally, plus the CSS backstop in globals.css for any
 * animation framer-motion does not own.
 */

/** Slightly decelerating. Movement should feel like it is settling, not stopping. */
export const EASE = [0.22, 1, 0.36, 1] as const;

export const DURATION = {
  fast: 0.2,
  base: 0.4,
  slow: 0.6,
} as const;

export const transition: Transition = {
  duration: DURATION.base,
  ease: EASE,
};

/** Travel distance for reveals. Small on purpose — large slides read as cheap. */
const RISE = 16;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: RISE },
  visible: { opacity: 1, y: 0, transition },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition },
};

/**
 * Parent of a list. Children inherit "hidden"/"visible" automatically, so a
 * staggered group needs no per-child orchestration.
 */
export const stagger: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.05,
    },
  },
};

/** Page transitions. Deliberately quieter than section reveals. */
export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.fast, ease: EASE },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: DURATION.fast, ease: EASE },
  },
};

/** Hover/press feedback for cards and buttons. */
export const hoverLift = {
  whileHover: { y: -2, transition: { duration: DURATION.fast, ease: EASE } },
  whileTap: { y: 0, scale: 0.99 },
} as const;

/**
 * Standard viewport trigger for scroll reveals. `once` matters: re-animating
 * on every scroll-by is the fastest way to make a site feel restless.
 */
export const VIEWPORT = { once: true, amount: 0.25 } as const;
