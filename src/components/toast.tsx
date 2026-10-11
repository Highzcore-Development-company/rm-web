"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { DURATION, EASE } from "@/lib/motion";
import { useDismissToast, useToasts } from "@/stores";

/**
 * Where toasts are drawn. The state behind them lives in the store's toast
 * slice (src/stores/slices/toast-slice.ts).
 *
 * This file used to own both. Splitting them is the point of the store: the
 * 14 components that raise a toast now depend on `useToast()` from "@/stores"
 * and not on this component existing anywhere near them, and this file is a
 * viewport with no state of its own.
 *
 * `useToast` moved to "@/stores" with the same shape it always had —
 * success(message) / error(message) — so no call site changed.
 */
export function ToastViewport() {
  const toasts = useToasts();
  const dismiss = useDismissToast();
  const reduced = useReducedMotion();

  return (
    <div
      // A live region, so a screen reader hears the result rather than only
      // sighted users seeing it. "polite" because none of this interrupts.
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: DURATION.fast, ease: EASE }}
            className="surface-raised pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-border p-4"
          >
            {toast.tone === "success" ? (
              <CheckCircle2
                className="mt-0.5 size-4 shrink-0 text-chart-up"
                aria-hidden="true"
              />
            ) : (
              <AlertCircle
                className="mt-0.5 size-4 shrink-0 text-chart-down"
                aria-hidden="true"
              />
            )}

            <p className="min-w-0 flex-1 text-sm leading-relaxed">
              {toast.message}
            </p>

            {/* Dismissable, because auto-dismiss is a guess about reading
                speed and someone may want it gone now. */}
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              className="-m-1 shrink-0 rounded p-1 text-fg-muted transition-colors hover:text-fg"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
