"use client";

import { useEffect, useRef } from "react";
import { TriangleAlert, X } from "lucide-react";

/**
 * A confirmation dialog, in place of window.confirm().
 *
 * NOT under components/admin, because the investor side needs it too: breaking
 * the broker link stops trading on somebody's real account, which is at least
 * as consequential as anything in the panel.
 *
 * Victor: "give me a good modal confirmation not this alert."
 *
 * The browser's confirm() is not just ugly — it is the wrong tool for these
 * particular decisions. It renders a chrome-coloured box prefixed with
 * "localhost:3000 says", which reads as something the page did to you rather
 * than something you are doing; it cannot show the thing you are acting on in
 * any way that distinguishes it from the sentence around it; and it blocks the
 * whole renderer, so the page behind cannot even finish painting while it is
 * open.
 *
 * WHAT THIS ADDS, beyond looking like the rest of the product:
 *
 *   - the SUBJECT is a line of its own. "Remove admin rights from
 *     estherolukorede12@gmail.com?" buries the address mid-sentence, which is
 *     exactly the word somebody needs to read twice before clicking.
 *   - DESTRUCTIVE ACTIONS ARE RED and say what they do — "Remove", not "OK".
 *     A button labelled OK tells you nothing about which way it goes.
 *   - CANCEL IS FOCUSED, so Enter on a dialog you did not read is the safe
 *     answer. confirm() focuses OK.
 *   - Escape and a click outside both cancel, and focus is trapped inside
 *     while it is open.
 */

export type ConfirmProps = {
  title: string;
  /** The thing being acted on — an address, a market. Shown on its own line. */
  subject?: string;
  body: string;
  /** The label on the button that proceeds. Never "OK". */
  action: string;
  /** Red, for anything that takes access away or cannot be undone. */
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  title,
  subject,
  body,
  action,
  destructive = false,
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // THE SAFE BUTTON TAKES FOCUS. Somebody who hits Enter without reading
    // should land on "no" — confirm() does the opposite.
    cancelRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;

      // Trap the tab ring inside the dialog. Without it, tabbing walks onto
      // the page behind — which still has the button that opened this.
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled])",
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onCancel, pending]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cancel"
        tabIndex={-1}
        onClick={() => !pending && onCancel()}
        className="fixed inset-0 cursor-default bg-black/60"
      />

      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        className="surface-raised relative z-10 w-full max-w-md rounded-xl border border-border shadow-elev-2"
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          <span
            className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${
              destructive
                ? "bg-chart-down/15 text-chart-down"
                : "bg-accent/15 text-accent"
            }`}
          >
            <TriangleAlert className="size-4.5" aria-hidden="true" />
          </span>

          <div className="min-w-0 flex-1">
            <h2 id="confirm-title" className="text-base font-semibold">
              {title}
            </h2>
            {subject ? (
              // On its own line and in the foreground colour: this is the word
              // worth reading twice, and mid-sentence is where it gets skimmed.
              <p className="mt-1.5 break-all font-medium">{subject}</p>
            ) : null}
            <p
              id="confirm-body"
              className="mt-2 text-sm leading-relaxed text-fg-muted"
            >
              {body}
            </p>
          </div>

          <button
            type="button"
            onClick={() => !pending && onCancel()}
            aria-label="Cancel"
            className="shrink-0 text-fg-muted transition-colors hover:text-fg"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-border px-5 py-4">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => !pending && onCancel()}
            disabled={pending}
            className="rounded-lg border border-border px-4 py-2.5 text-sm text-fg-muted transition-colors hover:text-fg disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
              destructive
                ? "bg-chart-down text-white hover:brightness-110"
                : "bg-accent text-[#0A0A0A] hover:bg-accent-hot"
            }`}
          >
            {pending ? "Working…" : action}
          </button>
        </div>
      </div>
    </div>
  );
}
