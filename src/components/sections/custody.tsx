"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Container, Eyebrow } from "@/components/ui";
import { EASE, VIEWPORT } from "@/lib/motion";

/**
 * The custody section.
 *
 * This is the single objection that stops people signing up — "so I send you my
 * money?" — and it was buried as one FAQ row. It earns its own section, laid
 * out as three columns so the answer is visible before anything is read:
 * a long list of what stays yours, a short list of what we get, and a list of
 * what we never get.
 *
 * The asymmetry is the argument. Three items against two against three, with
 * the middle column deliberately the shortest.
 */
export function Custody() {
  const t = useTranslations("home.custody");
  const reduced = useReducedMotion();

  const columns = [
    {
      key: "yours" as const,
      tone: "accent" as const,
      items: t.raw("yours.items") as string[],
      label: t("yours.label"),
    },
    {
      key: "ours" as const,
      tone: "neutral" as const,
      items: t.raw("ours.items") as string[],
      label: t("ours.label"),
    },
    {
      key: "never" as const,
      tone: "danger" as const,
      items: t.raw("never.items") as string[],
      label: t("never.label"),
    },
  ];

  return (
    <section className="relative overflow-hidden border-y border-border py-20 sm:py-28">
      {/* A single soft field behind the section so it reads as a distinct
          chapter rather than another block of cards on the same flat page. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-[28rem] w-[46rem] -translate-x-1/2 rounded-full bg-accent/[0.07] blur-[120px]"
      />

      <Container className="relative">
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

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {columns.map((col, i) => (
            <motion.div
              key={col.key}
              initial={reduced ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VIEWPORT}
              transition={{ duration: 0.55, delay: i * 0.1, ease: EASE }}
              className={`rounded-xl border p-6 ${
                col.tone === "accent"
                  ? "border-accent/35 bg-accent/[0.04]"
                  : col.tone === "danger"
                    ? "border-border bg-surface/40"
                    : "border-border bg-surface/60"
              }`}
            >
              <p
                className={`text-xs font-semibold uppercase tracking-[0.14em] ${
                  col.tone === "accent" ? "text-accent" : "text-fg-muted"
                }`}
              >
                {col.label}
              </p>

              <ul className="mt-5 space-y-3">
                {col.items.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm">
                    <Glyph tone={col.tone} />
                    <span
                      className={
                        col.tone === "danger" ? "text-fg-muted" : "text-fg"
                      }
                    >
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </Container>
    </section>
  );
}

/** Tick, dot or cross. Decorative — the column heading already says which. */
function Glyph({ tone }: { tone: "accent" | "neutral" | "danger" }) {
  const base = "mt-0.5 h-4 w-4 shrink-0";
  if (tone === "danger") {
    return (
      <svg className={`${base} text-fg-muted`} viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M4 4l8 8M12 4l-8 8"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg
      className={`${base} ${tone === "accent" ? "text-accent" : "text-fg-muted"}`}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        d="M3.5 8.5l3 3 6-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
