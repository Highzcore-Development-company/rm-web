import type { SliceCreator } from "../types";

/**
 * Toasts, for the moments where a result would otherwise appear as a line of
 * text somebody has already looked away from.
 *
 * Deliberately small: a confirmation and an error, no queueing policy, no
 * actions inside them. Anything that needs a decision belongs on the page, not
 * in something that disappears after four seconds.
 *
 * This was a React Context. The public API — `success(msg)` / `error(msg)` —
 * is unchanged, because 14 call sites use it and a refactor that rewrites
 * working call sites to prove it happened is a worse refactor.
 */

export type Toast = {
  id: number;
  message: string;
  tone: "success" | "error";
};

export type ToastSlice = {
  toasts: Toast[];
  pushToast: (message: string, tone: Toast["tone"]) => void;
  dismissToast: (id: number) => void;
};

/** Long enough to read a sentence, short enough not to sit in the way. */
export const DISMISS_AFTER_MS = 4500;

export const createToastSlice: SliceCreator<ToastSlice> = (set, get) => {
  // Per-store, not module-level. A module-level counter would be shared by
  // every store instance the server creates, so two users' toasts could be
  // handed the same React key in the same render pass.
  let nextId = 0;

  return {
    toasts: [],

    pushToast: (message, tone) => {
      const id = nextId++;
      set(
        (s) => ({ toasts: [...s.toasts, { id, message, tone }] }),
        false,
        "toast/push",
      );

      // Plain setTimeout, not window.setTimeout: it exists in Node too, so
      // this neither throws during a server render nor needs a `typeof
      // window` guard that would silently make the toast permanent anywhere
      // without a DOM — including under test, which is how that guard was
      // found. In practice toasts are only ever pushed from event handlers,
      // so this runs in a browser regardless.
      setTimeout(() => get().dismissToast(id), DISMISS_AFTER_MS);
    },

    dismissToast: (id) =>
      set(
        (s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }),
        false,
        "toast/dismiss",
      ),
  };
};
