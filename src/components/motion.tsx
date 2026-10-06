"use client";

import { MotionConfig, motion } from "framer-motion";
import type { Transition, Variants } from "framer-motion";
import type { ComponentProps, ReactNode } from "react";
import {
  fadeUp,
  hoverLift,
  pageTransition,
  stagger,
  VIEWPORT,
} from "@/lib/motion";

/**
 * P2-006 — the motion primitives. Pages compose these; pages never import
 * framer-motion directly, so there is exactly one place the animation
 * vocabulary is defined.
 */

/**
 * Motion components are created once, at module scope. Building them inside a
 * render — even memoised — produces a fresh component type whenever the memo
 * misses, which remounts the subtree and kills the animation mid-flight.
 *
 * The side effect is a closed set of tags, which is the right constraint: a
 * reveal should wrap a semantic element, not an arbitrary one.
 */
type MotionTag =
  | "div"
  | "section"
  | "ul"
  | "ol"
  | "li"
  | "dl"
  | "h1"
  | "h2"
  | "h3"
  | "p";

/**
 * Only the props these primitives actually use. A full HTMLMotionProps<"div">
 * does not fit motion.li or motion.dl — the per-element event handler types
 * diverge — and widening it would just push the cast somewhere less visible.
 */
type MotionElProps = {
  as: MotionTag;
  children?: ReactNode;
  className?: string;
  variants?: Variants;
  initial?: string;
  animate?: string;
  whileInView?: string;
  viewport?: { once?: boolean; amount?: number | "some" | "all" };
  transition?: Transition;
};

/**
 * Dispatches to the right motion element. Written as a switch returning JSX
 * rather than a lookup table, so no component is ever produced by a call
 * during render — the thing that remounts subtrees mid-animation.
 */
function MotionEl({ as, ...props }: MotionElProps) {
  switch (as) {
    case "section":
      return <motion.section {...props} />;
    case "ul":
      return <motion.ul {...props} />;
    case "ol":
      return <motion.ol {...props} />;
    case "li":
      return <motion.li {...props} />;
    case "dl":
      return <motion.dl {...props} />;
    case "h1":
      return <motion.h1 {...props} />;
    case "h2":
      return <motion.h2 {...props} />;
    case "h3":
      return <motion.h3 {...props} />;
    case "p":
      return <motion.p {...props} />;
    default:
      return <motion.div {...props} />;
  }
}

/**
 * reducedMotion="user" makes framer-motion honour the OS setting for every
 * descendant: transforms are dropped, opacity is kept. Wraps the whole app, so
 * no component can opt out of a user's accessibility preference by accident.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

type RevealProps = {
  children: ReactNode;
  /** Rendered element. Use the semantically correct tag, not always a div. */
  as?: MotionTag;
  className?: string;
  delay?: number;
};

/** Fades and rises into view once, when scrolled to. */
export function Reveal({
  children,
  as = "div",
  className,
  delay = 0,
}: RevealProps) {
  return (
    <MotionEl
      as={as}
      className={className}
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
      transition={delay ? { delay } : undefined}
    >
      {children}
    </MotionEl>
  );
}

/**
 * Reveals its children in sequence. Children must be <StaggerItem> — they
 * inherit the hidden/visible state from here rather than declaring their own.
 */
export function Stagger({ children, as = "div", className }: RevealProps) {
  return (
    <MotionEl
      as={as}
      className={className}
      variants={stagger}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
    >
      {children}
    </MotionEl>
  );
}

export function StaggerItem({ children, as = "div", className }: RevealProps) {
  return (
    <MotionEl as={as} className={className} variants={fadeUp}>
      {children}
    </MotionEl>
  );
}

/** Hover/press feedback. For cards and anything else that is clickable. */
export function Lift({
  children,
  className,
  ...props
}: ComponentProps<typeof motion.div>) {
  return (
    <motion.div className={className} {...hoverLift} {...props}>
      {children}
    </motion.div>
  );
}

/** Wraps page content so route changes fade rather than snap. */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      variants={pageTransition}
      initial="hidden"
      animate="visible"
      className="flex-1"
    >
      {children}
    </motion.div>
  );
}
