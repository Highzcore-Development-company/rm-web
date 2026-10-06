"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Container } from "@/components/ui";
import { EASE, VIEWPORT } from "@/lib/motion";

const KEYS = ["custody", "stop", "cost", "losses", "broker"] as const;

/**
 * FAQ as an accordion rather than a wall of open text.
 *
 * Built on <button> inside a definition list with aria-expanded and
 * aria-controls, not a <details> element — <details> cannot be animated
 * reliably across browsers, and the height transition is the whole point.
 *
 * One panel open at a time. Several open at once reflows the page under the
 * reader's cursor, which is worse than the extra click.
 */
export function Faq() {
  const t = useTranslations("home.faq");
  const reduced = useReducedMotion();
  const [open, setOpen] = useState<string | null>(KEYS[0]);

  return (
    <section className="border-t border-border py-20 sm:py-28">
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

        <dl className="mt-12 max-w-3xl">
          {KEYS.map((key, i) => {
            const isOpen = open === key;
            return (
              <motion.div
                key={key}
                className="border-b border-border first:border-t"
                initial={reduced ? false : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={VIEWPORT}
                transition={{ duration: 0.45, delay: i * 0.06, ease: EASE }}
              >
                <dt>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : key)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-${key}`}
                    className="flex w-full items-center justify-between gap-6 py-5 text-left transition-colors hover:text-accent"
                  >
                    <span className="text-base font-semibold">
                      {t(`items.${key}.q`)}
                    </span>
                    <motion.span
                      aria-hidden="true"
                      className="shrink-0 text-fg-muted"
                      animate={{ rotate: isOpen ? 45 : 0 }}
                      transition={{ duration: 0.25, ease: EASE }}
                    >
                      <svg width="18" height="18" viewBox="0 0 18 18">
                        <path
                          d="M9 3v12M3 9h12"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                        />
                      </svg>
                    </motion.span>
                  </button>
                </dt>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.dd
                      id={`faq-${key}`}
                      // height:auto is animatable in framer-motion and nowhere
                      // else; overflow-hidden stops the text spilling mid-collapse.
                      initial={reduced ? false : { height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: EASE }}
                      className="overflow-hidden"
                    >
                      <p className="pb-6 pr-10 text-sm leading-relaxed text-fg-muted">
                        {t(`items.${key}.a`)}
                      </p>
                    </motion.dd>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </dl>
      </Container>
    </section>
  );
}
