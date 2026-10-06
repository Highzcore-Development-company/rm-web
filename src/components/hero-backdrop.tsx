"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/**
 * The hero backdrop: four layers, none of which touch layout.
 *
 *   1. dot grid, radially masked so it dissolves at the edges
 *   2. two blurred colour fields that drift
 *   3. a diagonal light beam
 *   4. a spotlight that follows the cursor
 *
 * Everything animates `transform` and `opacity` only. Animating blur, width or
 * background-position would relayout or repaint the whole hero every frame and
 * drop it to single-digit FPS on a mid-range laptop — the exact machines most
 * visitors are on.
 *
 * The whole thing is `pointer-events-none` and `aria-hidden`: it is decoration,
 * and it must never eat a click meant for the call to action beneath it.
 */
export function HeroBackdrop() {
  const reduced = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <DotGrid />
      <Orbs reduced={Boolean(reduced)} />
      <Beam reduced={Boolean(reduced)} />
      <Spotlight reduced={Boolean(reduced)} />

      {/* Fade the whole backdrop into the section below so the hero ends
          instead of being cut off by a hard edge. */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-bg" />
    </div>
  );
}

function DotGrid() {
  return (
    <div
      className="absolute inset-0 opacity-[0.35]"
      style={{
        backgroundImage:
          "radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)",
        backgroundSize: "32px 32px",
        // Without the mask the grid runs to the edges and reads as a texture
        // bug rather than depth.
        maskImage:
          "radial-gradient(ellipse 80% 60% at 50% 35%, #000 20%, transparent 75%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 80% 60% at 50% 35%, #000 20%, transparent 75%)",
      }}
    />
  );
}

function Orbs({ reduced }: { reduced: boolean }) {
  // Low opacity on purpose. These sit behind white body text, and anything
  // stronger starts eating contrast on the one thing people have to read.
  const common = "absolute rounded-full blur-[130px] will-change-transform";

  return (
    <>
      <motion.div
        className={`${common} -left-40 -top-32 h-[34rem] w-[34rem] bg-accent/[0.16]`}
        animate={reduced ? undefined : { x: [0, 70, 0], y: [0, 40, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className={`${common} -right-32 top-10 h-[30rem] w-[30rem] bg-[#2563EB]/[0.13]`}
        animate={reduced ? undefined : { x: [0, -60, 0], y: [0, 60, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />
      <motion.div
        className={`${common} left-1/3 top-1/2 h-[24rem] w-[24rem] bg-accent-hot/[0.10]`}
        animate={reduced ? undefined : { x: [0, 40, 0], y: [0, -50, 0] }}
        transition={{ duration: 25, repeat: Infinity, ease: "easeInOut", delay: 4 }}
      />
    </>
  );
}

function Beam({ reduced }: { reduced: boolean }) {
  return (
    <motion.div
      className="absolute -right-1/4 -top-1/2 h-[150%] w-[60%] origin-top-right"
      style={{
        background:
          "linear-gradient(195deg, rgba(255,255,255,0.055) 0%, transparent 55%)",
        transform: "rotate(14deg)",
      }}
      initial={reduced ? false : { opacity: 0 }}
      animate={reduced ? undefined : { opacity: [0.45, 0.85, 0.45] }}
      transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

function Spotlight({ reduced }: { reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (reduced) return;
    // Touch devices have no hover, so the spotlight would sit frozen wherever
    // the last tap landed. Skip it entirely rather than leave a stuck blob.
    if (!window.matchMedia("(hover: hover)").matches) return;

    let frame = 0;
    const onMove = (e: PointerEvent) => {
      // One rAF per frame regardless of pointer rate. Writing the custom
      // properties on every pointermove runs style recalc far more often than
      // the screen can show it.
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const el = ref.current;
        if (!el) return;
        const r = el.parentElement?.getBoundingClientRect();
        if (!r) return;
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
      setActive(true);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [reduced]);

  if (reduced) return null;

  return (
    <div
      ref={ref}
      className="absolute inset-0 transition-opacity duration-700"
      style={{
        opacity: active ? 1 : 0,
        background:
          "radial-gradient(420px circle at var(--mx, 50%) var(--my, 30%), rgba(255,176,32,0.07), transparent 70%)",
      }}
    />
  );
}
