"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A dropdown that closes on Escape and on a click outside.
 *
 * Extracted because there are now three of these in the navbar — the profile
 * menu, live positions and pending setups — and the dismissal rules are the
 * part that is genuinely identical. Everything else about them differs.
 *
 * Pointer events rather than click: a mousedown outside should dismiss before
 * the click lands, so dismissing a menu never also presses whatever was
 * underneath it. These menus sit over the figures and over each other.
 */
export function useDismissable<T extends HTMLElement = HTMLDivElement>() {
  const [open, setOpen] = useState(false);
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return { open, setOpen, ref };
}
