"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { DURATION, EASE } from "@/lib/motion";

/**
 * Toasts, for the moments where a result would otherwise appear as a line of
 * text somebody has already looked away from.
 *
 * Deliberately small: a confirmation and an error, no queueing policy, no
 * actions inside them. Anything that needs a decision belongs on the page, not
 * in something that disappears after four seconds.
 */

type Toast = { id: number; message: string; tone: "success" | "error" };

type ToastContext = {
  success: (message: string) => void;
  error: (message: string) => void;
};

const Ctx = createContext<ToastContext | null>(null);

/** Long enough to read a sentence, short enough not to sit in the way. */
const DISMISS_AFTER_MS = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: Toast["tone"]) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, tone }]);
      window.setTimeout(() => remove(id), DISMISS_AFTER_MS);
    },
    [remove],
  );

  const value = useMemo<ToastContext>(
    () => ({
      success: (message) => push(message, "success"),
      error: (message) => push(message, "error"),
    }),
    [push],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={remove} />
    </Ctx.Provider>
  );
}

export function useToast(): ToastContext {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return ctx;
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
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
              onClick={() => onDismiss(toast.id)}
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
