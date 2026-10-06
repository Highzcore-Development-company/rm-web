"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ButtonLink, Container, Eyebrow } from "@/components/ui";
import { EASE, VIEWPORT } from "@/lib/motion";

/**
 * The second product, introduced as an alternative rather than a second pitch.
 *
 * The page sells the analysis tool. Someone who has read this far either wants
 * to trade themselves — in which case they have already seen their product —
 * or does not, and this is the off-ramp for them. It is deliberately one block,
 * not a second hero: a page that pitches twice converts on neither.
 *
 * "Managed trading", never "copy trading". It is what a MAM account actually
 * is, and it avoids the signal-seller connotation the other term carries.
 */
export function Managed() {
  const t = useTranslations("home.managed");
  const reduced = useReducedMotion();

  return (
    <section className="relative overflow-hidden border-y border-border bg-surface/40 py-20 sm:py-24">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-0 h-[22rem] w-[30rem] rounded-full bg-accent/[0.06] blur-[110px]"
      />

      <Container className="relative">
        <motion.div
          className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between"
          initial={reduced ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <div className="max-w-2xl">
            <Eyebrow>{t("eyebrow")}</Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              {t("title")}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-fg-muted">
              {t("body")}
            </p>
          </div>

          <ButtonLink href="/how-it-works" variant="secondary" className="shrink-0">
            {t("cta")}
          </ButtonLink>
        </motion.div>
      </Container>
    </section>
  );
}
