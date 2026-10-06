/**
 * P2-009 — dark/light mode.
 *
 * Dark is the brand default. The stored override wins over the OS setting,
 * the OS setting wins over the default. Absence of a stored value is
 * meaningful, so we store "light" | "dark" only, never "system".
 */

export const THEME_STORAGE_KEY = "hz-theme";

export type Theme = "light" | "dark";

/**
 * Runs before first paint to stamp data-theme on <html>, so a user whose
 * stored preference differs from the default never sees a flash of the wrong
 * theme. Inlined into the document head — keep it dependency-free and small.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("${THEME_STORAGE_KEY}");
    if (stored === "light" || stored === "dark") {
      document.documentElement.setAttribute("data-theme", stored);
    }
  } catch (e) {
    /* private mode, or storage disabled — fall through to CSS defaults */
  }
})();
`.trim();
