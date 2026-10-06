"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { LogoLink } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { ButtonLink, Container } from "@/components/ui";
import { DURATION, EASE } from "@/lib/motion";

const LINKS = [
  { href: "/how-it-works", key: "howItWorks" },
  { href: "/pricing", key: "pricing" },
  { href: "/performance", key: "performance" },
] as const;

/**
 * The header is the only chrome on every page, so it earns the client bundle.
 *
 * Three things it now does that it did not before:
 *
 *   1. On mobile it is actually navigable. The links used to be `hidden
 *      md:flex` with nothing behind them, which meant a phone could reach the
 *      marketing pages only from a footer link or the address bar.
 *   2. It says where you are. An unmarked nav on a five-page site makes every
 *      page feel like the same page.
 *   3. It is transparent over the hero and only grows its border and blur once
 *      you scroll. A hairline sitting under the fold on first paint cuts the
 *      hero off at the top.
 */
export function SiteHeader() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  // `scrolled` drives the border and blur. A threshold rather than `> 0`, so
  // one pixel of trackpad drift does not flicker the border on and off.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The panel closes on the click that navigates, not in an effect watching
  // the pathname. The header never unmounts between marketing routes, so
  // something has to close it — but doing that in an effect is a cascading
  // render, and the click is the event that actually means "close".
  const close = () => setOpen(false);

  // Escape closes it, and the page behind must not scroll underneath it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled || open
          ? "border-b border-border bg-bg/80 backdrop-blur supports-[backdrop-filter]:bg-bg/60"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <Container className="flex h-16 items-center justify-between gap-4">
        {/* P2-001. Both variants render and CSS picks one, so the right
            wordmark is painted on the first frame rather than swapping after
            hydration. priority: it is the largest element above the fold. */}
        <LogoLink width={150} priority />

        <nav
          aria-label="Main"
          className="hidden items-center gap-1 text-sm md:flex"
        >
          {LINKS.map(({ href, key }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative rounded-md px-3 py-2 transition-colors ${
                  active ? "text-fg" : "text-fg-muted hover:text-fg"
                }`}
              >
                {t(key)}
                {active ? (
                  // layoutId slides the marker between links rather than
                  // cross-fading two of them, so the nav reads as one object.
                  <motion.span
                    layoutId="nav-active"
                    aria-hidden="true"
                    className="absolute inset-x-3 -bottom-px h-px bg-accent"
                    transition={
                      reduced
                        ? { duration: 0 }
                        : { duration: DURATION.fast, ease: EASE }
                    }
                  />
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />

          <Link
            href="/app/login"
            className="hidden text-sm text-fg-muted transition-colors hover:text-fg sm:block"
          >
            {t("signIn")}
          </Link>

          <ButtonLink href="/app/signup" className="px-4 py-2">
            {t("getStarted")}
          </ButtonLink>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? t("closeMenu") : t("openMenu")}
            className="-mr-1 flex size-10 items-center justify-center rounded-lg text-fg-muted transition-colors hover:text-fg md:hidden"
          >
            {open ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <Menu className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </Container>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id="mobile-nav"
            key="mobile-nav"
            // Height rather than a full-screen overlay: the header stays
            // visible and the page is never hidden behind an opaque sheet.
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: DURATION.base, ease: EASE }}
            className="overflow-hidden border-t border-border bg-bg/95 backdrop-blur md:hidden"
          >
            <Container className="py-4">
              <nav aria-label={t("menuTitle")} className="flex flex-col">
                {LINKS.map(({ href, key }) => {
                  const active = isActive(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={close}
                      aria-current={active ? "page" : undefined}
                      className={`border-l-2 py-3 pl-4 text-base transition-colors ${
                        active
                          ? "border-accent text-fg"
                          : "border-transparent text-fg-muted hover:border-border hover:text-fg"
                      }`}
                    >
                      {t(key)}
                    </Link>
                  );
                })}

                {/* Sign in is hidden on narrow screens in the bar itself, so
                    without this line a phone cannot reach the login page. */}
                <Link
                  href="/app/login"
                  onClick={close}
                  className="mt-2 border-t border-border py-3 pl-4 text-base text-fg-muted transition-colors hover:text-fg"
                >
                  {t("signIn")}
                </Link>
              </nav>
            </Container>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
