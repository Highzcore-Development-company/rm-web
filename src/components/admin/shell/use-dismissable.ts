"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A dropdown that opens on hover, and closes on Escape or a click outside.
 *
 * Extracted because there are three of these in the navbar — the profile menu,
 * live positions and pending setups — and the dismissal rules are the part that
 * is genuinely identical. Everything else about them differs.
 *
 * Pointer events rather than click for the outside test: a mousedown outside
 * should dismiss before the click lands, so dismissing a menu never also
 * presses whatever was underneath it. These menus sit over the figures and over
 * each other.
 *
 * HOVER IS DESKTOP-ONLY, and guarded on the device rather than the width.
 * Victor asked for "mouse enter dropdown not only clicked" for desktop. A touch
 * device fires a synthetic mouseenter on tap, so hover-to-open there means the
 * menu appears and the tap that opened it also counts as the tap that closes
 * it — the classic phantom-hover bug. `(hover: hover) and (pointer: fine)` asks
 * the question that actually matters: does this input device have a cursor
 * that can rest on something. Width cannot answer that; a touchscreen laptop is
 * wide and still taps.
 *
 * CLICK STILL WORKS on both, because hover alone is not operable from a
 * keyboard and is awkward for anyone with a tremor or using a head pointer.
 *
 * The close is delayed. Button and menu are separate boxes with a gap between
 * them, so a cursor travelling from one to the other leaves both for a few
 * frames — closing immediately makes the menu impossible to reach.
 */

/** How long the cursor may be outside before the menu closes. */
const CLOSE_DELAY_MS = 160;

export function useDismissable<T extends HTMLElement = HTMLDivElement>() {
  const [open, setOpen] = useState(false);
  const ref = useRef<T>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

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

  // Any pending close must not fire after the component has gone.
  useEffect(() => cancelClose, [cancelClose]);

  /**
   * Spread onto the element that wraps BOTH the button and the menu, so the
   * cursor moving between them counts as staying inside.
   *
   * Checked at event time rather than stored in state: a lazily-attached
   * matchMedia listener would be one more subscription per menu for a value
   * that only matters at the moment of the event, and reading it here keeps
   * the first render identical on server and client.
   */
  const hoverProps = {
    onMouseEnter: () => {
      if (!canHover()) return;
      cancelClose();
      setOpen(true);
    },
    onMouseLeave: () => {
      if (!canHover()) return;
      cancelClose();
      timer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
    },
  };

  return { open, setOpen, ref, hoverProps };
}

/** Does this input device have a cursor that can rest on something? */
function canHover(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}
