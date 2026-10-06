"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ButtonLink, Container } from "@/components/ui";
import { EASE, VIEWPORT } from "@/lib/motion";

/**
 * Closing call to action.
 *
 * The page previously ended on the FAQ, which leaves someone who has read the
 * whole thing with nowhere to go but the back button. A reader who reaches the
 * bottom is the most convinced visitor on the page and should not have to
 * scroll back up to act.
 */
export function CtaBand() {
  const t = useTranslations("home.cta");
  const reduced = useReducedMotion();

  return (
    <section className="relative overflow-hidden border-t border-border py-20 sm:py-28">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 100% at 50% 100%, rgba(255,176,32,0.10), transparent 70%)",
        }}
      />

      <Container className="relative">
        <motion.div
          className="mx-auto max-w-2xl text-center"
          initial={reduced ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-fg-muted">{t("body")}</p>

          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href="/app/signup">{t("primary")}</ButtonLink>
            <ButtonLink href="/performance" variant="secondary">
              {t("secondary")}
            </ButtonLink>
          </div>
        </motion.div>
      </Container>
    </section>
  );
}
