"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Container, Eyebrow } from "@/components/ui";
import { EASE, VIEWPORT } from "@/lib/motion";

type Item = { title: string; body: string };

/**
 * What the analysis actually tells a trader.
 *
 * Framed as four questions rather than four features, because that is how
 * someone about to place a trade is already thinking. It also keeps the claims
 * honest: every one of these is a question about the CONDITION of a market,
 * not a prediction of where price will go. We can stand behind the first;
 * nobody can stand behind the second.
 */
export function Analysis() {
  const t = useTranslations("home.analysis");
  const reduced = useReducedMotion();
  const items = t.raw("items") as Item[];

  return (
    <section className="relative overflow-hidden py-20 sm:py-28">
      <Container>
        <motion.div
          className="max-w-2xl"
          initial={reduced ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-fg-muted">{t("body")}</p>
        </motion.div>

        <div className="mt-14 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
          {items.map((item, i) => (
            <motion.div
              key={item.title}
              className="group relative bg-bg p-7 transition-colors hover:bg-surface/60"
              initial={reduced ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VIEWPORT}
              transition={{ duration: 0.5, delay: i * 0.08, ease: EASE }}
            >
              {/* A hairline that grows on hover — enough to make a flat grid
                  feel responsive without moving anything and causing reflow. */}
              <span
                aria-hidden="true"
                className="absolute left-0 top-0 h-px w-0 bg-accent transition-all duration-500 group-hover:w-full"
              />

              <p className="font-mono text-xs text-accent">
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-4 text-lg font-semibold leading-snug">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                {item.body}
              </p>
            </motion.div>
          ))}
        </div>

        <p className="mt-6 text-sm text-fg-muted">{t("disclaimer")}</p>
      </Container>
    </section>
  );
}
