"use client";

import { THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

function resolveCurrentTheme(): Theme {
  const stamped = document.documentElement.getAttribute("data-theme");
  if (stamped === "light" || stamped === "dark") return stamped;
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

/**
 * Stateless by design. The server cannot know the user's theme, so holding it
 * in React state means either a hydration mismatch or a flash. Instead the
 * active theme lives in one place — data-theme on <html> — and CSS decides
 * which icon is visible (see globals.css).
 */
export function ThemeToggle() {
  function toggle() {
    const next: Theme = resolveCurrentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* storage disabled — the override still applies for this page view */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle light and dark mode"
      className="inline-flex size-9 items-center justify-center rounded-md border border-border text-fg-muted transition-colors hover:text-fg"
    >
      <span aria-hidden="true" className="theme-icon-dark text-sm">
        ☾
      </span>
      <span aria-hidden="true" className="theme-icon-light text-sm">
        ☀
      </span>
    </button>
  );
}
