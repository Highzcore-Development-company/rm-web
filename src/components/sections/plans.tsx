"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ButtonLink, Container, Eyebrow } from "@/components/ui";
import { EASE, VIEWPORT } from "@/lib/motion";
import { formatUsd, PLANS } from "@/lib/pricing";

/**
 * The pricing teaser was one flat card saying "$20 a month". That hides the
 * actual offer — the discount only exists if you can see the four terms side
 * by side and compare the per-month figures.
 *
 * Every number comes from lib/pricing. Nothing here is a literal, so the page
 * cannot drift from what checkout charges.
 */
export function Plans() {
  const t = useTranslations("home.plans");
  const reduced = useReducedMotion();

  // 12 months is the one worth steering people to: best per-month rate, and it
  // is the term that makes a 3-month track record meaningful to an investor.
  const featured = 12;

  return (
    <section className="py-20 sm:py-28">
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

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan, i) => {
            const isFeatured = plan.months === featured;
            const saves = plan.discountCents > 0;

            return (
              <motion.div
                key={plan.months}
                initial={reduced ? false : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={VIEWPORT}
                transition={{ duration: 0.5, delay: i * 0.08, ease: EASE }}
                className={`relative flex flex-col rounded-xl border p-6 ${
                  isFeatured
                    ? "border-accent bg-accent/[0.05]"
                    : "border-border bg-surface/50"
                }`}
              >
                {saves && (
                  <span
                    className={`absolute -top-2.5 right-5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      isFeatured
                        ? "bg-accent text-[#0A0A0A]"
                        : "border border-border bg-surface text-fg-muted"
                    }`}
                  >
                    {t("save", { percent: `${plan.discountBps / 100}%` })}
                  </span>
                )}

                <p className="text-sm font-medium text-fg-muted">
                  {plan.months === 1
                    ? t("month", { count: plan.months })
                    : t("months", { count: plan.months })}
                </p>

                <p className="mt-3 text-3xl font-semibold tabular-nums">
                  {formatUsd(plan.totalCents)}
                </p>

                <p className="mt-1 text-sm text-fg-muted tabular-nums">
                  {t("perMonth", { price: formatUsd(plan.perMonthCents) })}
                </p>

                {saves ? (
                  <p className="mt-4 text-xs text-fg-muted tabular-nums">
                    <s>{formatUsd(plan.subtotalCents)}</s>{" "}
                    <span className="text-accent">
                      −{formatUsd(plan.discountCents)}
                    </span>
                  </p>
                ) : (
                  // Keeps the four cards the same height without a magic
                  // min-height that breaks when the copy is translated.
                  <p className="mt-4 text-xs text-transparent" aria-hidden="true">
                    —
                  </p>
                )}

                <div className="mt-6 flex-1" />

                <ButtonLink
                  href="/app/signup"
                  variant={isFeatured ? "primary" : "secondary"}
                  className="w-full justify-center"
                >
                  {t("cta")}
                </ButtonLink>
              </motion.div>
            );
          })}
        </div>

        <p className="mt-6 text-sm text-fg-muted">{t("note")}</p>
      </Container>
    </section>
  );
}
