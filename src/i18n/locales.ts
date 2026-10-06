/**
 * P2-010 — language settings.
 *
 * English only at launch, but every user-facing string lives in
 * `messages/<locale>.json` from day one. Adding a second locale (Victor to
 * choose) means adding a file here and switching on routing — not hunting
 * hardcoded strings through the codebase.
 *
 * No route prefix while there is one locale: `/pricing`, not `/en/pricing`.
 */

export const LOCALES = ["en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
