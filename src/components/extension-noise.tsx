"use client";

import { useEffect } from "react";

/**
 * Stop browser-extension errors from taking down the dev server.
 *
 * MetaMask injects a script into every page and rejects a promise when it
 * cannot reach its own background worker. Nothing here asks it to; it does
 * this uninvited, on a page that has never heard of it.
 *
 * In Next 16 dev that is not merely noise. Browser errors are forwarded to the
 * Node process, where an unhandled rejection kills the render worker:
 *
 *     ⨯ unhandledRejection: i: Failed to connect to MetaMask
 *     ⨯ Error: Jest worker encountered 2 child process exceptions,
 *       exceeding retry limit
 *
 * The page then renders as a runtime error with no stack of ours in it,
 * because none of it is ours. The dev log showed six of these and not one
 * line from this codebase in between.
 *
 * So: mark an extension's rejections as handled. preventDefault() stops the
 * event becoming an unhandled rejection at all, which is what Next reacts to.
 *
 * NARROW ON PURPOSE. It only silences rejections whose stack points at an
 * extension URL. Anything originating in our own code still throws, still
 * reaches the overlay, and still fails the build — swallowing errors broadly
 * to quieten one extension would cost far more than it saves.
 */
function fromExtension(reason: unknown): boolean {
  if (!reason) return false;
  const stack =
    (reason as { stack?: string }).stack ??
    (typeof reason === "string" ? reason : String((reason as Error)?.message ?? ""));
  return (
    stack.includes("chrome-extension://") ||
    stack.includes("moz-extension://") ||
    stack.includes("safari-extension://")
  );
}

export function ExtensionNoise() {
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      if (fromExtension(e.reason)) e.preventDefault();
    };
    const onError = (e: ErrorEvent) => {
      if (e.filename?.startsWith("chrome-extension://") || fromExtension(e.error)) {
        e.preventDefault();
      }
    };

    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  return null;
}
