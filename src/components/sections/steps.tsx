"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Container } from "@/components/ui";
import { EASE, VIEWPORT } from "@/lib/motion";

const KEYS = ["one", "two", "three"] as const;

/**
 * Three steps, connected.
 *
 * Previously three identical cards in a row, which reads as a feature list —
 * three things you could do in any order. These are sequential, and the
 * connecting line that draws itself as the section enters is what says so.
 *
 * The line is horizontal on desktop and vertical on mobile, because a sequence
 * reads along the axis the cards are actually stacked on.
 */
export function Steps() {
  const t = useTranslations("home.steps");
  const reduced = useReducedMotion();

  return (
    <section className="py-20 sm:py-28">
      <Container>
        <motion.h2
          className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl"
          initial={reduced ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.6, ease: EASE }}
        >
          {t("title")}
        </motion.h2>

        <div className="relative mt-14">
          {/* Connector. Behind the numerals, inset so it starts and ends at the
              first and last marker rather than running off the edges. */}
          <motion.div
            aria-hidden="true"
            className="absolute left-6 top-6 hidden h-px origin-left bg-gradient-to-r from-accent/60 via-accent/30 to-transparent md:block"
            style={{ right: "4rem" }}
            initial={reduced ? false : { scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={VIEWPORT}
            transition={{ duration: 1.1, ease: EASE }}
          />
          <motion.div
            aria-hidden="true"
            className="absolute bottom-10 left-6 top-6 w-px origin-top bg-gradient-to-b from-accent/60 via-accent/30 to-transparent md:hidden"
            initial={reduced ? false : { scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={VIEWPORT}
            transition={{ duration: 1.1, ease: EASE }}
          />

          <ol className="relative grid gap-10 md:grid-cols-3 md:gap-8">
            {KEYS.map((key, i) => (
              <motion.li
                key={key}
                className="relative pl-20 md:pl-0"
                initial={reduced ? false : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={VIEWPORT}
                transition={{ duration: 0.5, delay: 0.25 + i * 0.15, ease: EASE }}
              >
                <motion.span
                  aria-hidden="true"
                  className="absolute left-0 top-0 flex h-12 w-12 items-center justify-center rounded-full border border-accent/40 bg-bg font-mono text-sm font-semibold text-accent md:relative"
                  initial={reduced ? false : { scale: 0.6, opacity: 0 }}
                  whileInView={{ scale: 1, opacity: 1 }}
                  viewport={VIEWPORT}
                  transition={{
                    duration: 0.4,
                    delay: 0.3 + i * 0.15,
                    ease: EASE,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </motion.span>

                <h3 className="mt-0 text-lg font-semibold md:mt-6">
                  {t(`${key}.title`)}
                </h3>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-fg-muted">
                  {t(`${key}.body`)}
                </p>
              </motion.li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}
