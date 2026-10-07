"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * The thin bar at the top of the screen during a navigation.
 *
 * Server components mean a click can sit for a second with nothing on screen
 * changing — the old page is still fully rendered, so it reads as a click that
 * did not register, and people click again. The bar is the only thing saying
 * the request was heard.
 *
 * Written rather than installed. The usual packages patch history and
 * monkey-patch Link, which is a lot of surface area for a 2px rectangle.
 */

/** Below this, a bar appearing and vanishing is just a flash. */
const SHOW_AFTER_MS = 150;

export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const reduced = useReducedMotion();

  const [loading, setLoading] = useState(false);
  const firstRender = useRef(true);

  // A completed navigation changes pathname or query, so their arrival IS the
  // finish signal. There is no "navigation started" event to listen for in the
  // App Router, so the start is inferred from the click instead.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setLoading(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    function onClick(event: MouseEvent) {
      // Modified clicks open a new tab; this one is not navigating.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) {
        return;
      }

      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || anchor.target === "_blank" || anchor.hasAttribute("download")) {
        return;
      }

      // Same-document jumps and external links do not re-render anything.
      if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }

      timer = setTimeout(() => setLoading(true), SHOW_AFTER_MS);
    }

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearTimeout(timer);
    };
  }, []);

  return (
    <AnimatePresence>
      {loading ? (
        <motion.div
          key="route-progress"
          className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-0.5 origin-left bg-accent shadow-[0_0_10px_var(--accent)]"
          initial={{ scaleX: 0, opacity: 1 }}
          // Creeps towards 90% and waits. Claiming 100% before the page has
          // arrived is a lie the next frame exposes, and a bar that finishes
          // then sits there is worse than one still moving.
          animate={{ scaleX: 0.9 }}
          exit={{ scaleX: 1, opacity: 0 }}
          transition={
            reduced
              ? { duration: 0 }
              : { scaleX: { duration: 8, ease: [0.1, 0.9, 0.2, 1] }, opacity: { duration: 0.2 } }
          }
          aria-hidden="true"
        />
      ) : null}
    </AnimatePresence>
  );
}
