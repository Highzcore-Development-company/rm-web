"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { HeroBackdrop } from "@/components/hero-backdrop";
import { HeroChart } from "@/components/hero-chart";
import { ButtonLink, Container } from "@/components/ui";
import { EASE } from "@/lib/motion";

/**
 * The hero. Above the fold, so everything animates on load rather than on
 * scroll — a scroll-triggered entrance here would simply never be seen.
 *
 * The headline reveals word by word. Per-word rather than per-letter on
 * purpose: letter animation on a 12-word sentence is 60 elements fighting for
 * frames, and it reads as a gimmick. Words read as emphasis.
 */
export function Hero() {
  const t = useTranslations("home.hero");
  const reduced = useReducedMotion();

  const title = t("title");
  const words = title.split(" ");

  const show = (delay: number) =>
    reduced
      ? { initial: false as const, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, delay, ease: EASE },
        };

  return (
    <section className="relative isolate overflow-hidden">
      <HeroBackdrop />

      <Container className="relative py-20 sm:py-28 lg:py-32">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
          <div>
            <motion.div {...show(0)}>
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-accent backdrop-blur">
                <span className="relative flex h-1.5 w-1.5">
                  {!reduced && (
                    <motion.span
                      className="absolute inline-flex h-full w-full rounded-full bg-accent"
                      animate={{ scale: [1, 2.4], opacity: [0.7, 0] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                    />
                  )}
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                </span>
                {t("eyebrow")}
              </span>
            </motion.div>

            <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              {words.map((word, i) => (
                <motion.span
                  key={`${word}-${i}`}
                  className="inline-block"
                  initial={reduced ? false : { opacity: 0, y: 24, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{
                    duration: 0.55,
                    delay: reduced ? 0 : 0.12 + i * 0.055,
                    ease: EASE,
                  }}
                >
                  {word}
                  {i < words.length - 1 ? " " : ""}
                </motion.span>
              ))}
            </h1>

            <motion.p
              className="mt-7 max-w-xl text-lg leading-relaxed text-fg-muted"
              {...show(0.75)}
            >
              {t("body")}
            </motion.p>

            <motion.div
              className="mt-9 flex flex-col gap-3 sm:flex-row"
              {...show(0.9)}
            >
              <ButtonLink href="/app/signup">{t("primaryCta")}</ButtonLink>
              <ButtonLink href="/how-it-works" variant="secondary">
                {t("secondaryCta")}
              </ButtonLink>
            </motion.div>
          </div>

          {/* The chart. Hidden from assistive tech as a whole — it is an
              illustration, and HeroChart already carries its own description. */}
          <motion.div
            className="relative"
            initial={reduced ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: reduced ? 0 : 0.3, ease: EASE }}
          >
            <div className="relative rounded-2xl border border-border bg-surface/40 p-5 backdrop-blur-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-accent" />
                  <span className="font-mono text-xs text-fg-muted">XAUUSD · H1</span>
                </div>
                <span className="font-mono text-xs text-accent">+2.84%</span>
              </div>

              <HeroChart />
            </div>

            <FloatingCard
              className="-left-4 top-10 hidden sm:block"
              delay={2.6}
              reduced={Boolean(reduced)}
              label="Open P&L"
              value="+$127.26"
              accent
            />
            <FloatingCard
              className="-right-3 bottom-8 hidden sm:block"
              delay={2.9}
              reduced={Boolean(reduced)}
              label="Your funds"
              value="Never held"
            />
          </motion.div>
        </div>
      </Container>
    </section>
  );
}

function FloatingCard({
  className = "",
  delay,
  reduced,
  label,
  value,
  accent = false,
}: {
  className?: string;
  delay: number;
  reduced: boolean;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <motion.div
      aria-hidden="true"
      className={`absolute rounded-xl border border-border bg-surface/80 px-4 py-3 shadow-xl backdrop-blur-md ${className}`}
      initial={reduced ? false : { opacity: 0, y: 12, scale: 0.9 }}
      animate={
        reduced
          ? { opacity: 1 }
          : { opacity: 1, y: [12, 0, -6, 0], scale: 1 }
      }
      transition={
        reduced
          ? undefined
          : {
              opacity: { duration: 0.5, delay },
              scale: { duration: 0.5, delay },
              y: {
                duration: 6,
                delay: delay + 0.5,
                repeat: Infinity,
                ease: "easeInOut",
              },
            }
      }
    >
      <p className="text-[10px] uppercase tracking-wider text-fg-muted">{label}</p>
      <p
        className={`mt-0.5 font-mono text-sm font-semibold ${
          accent ? "text-accent" : "text-fg"
        }`}
      >
        {value}
      </p>
    </motion.div>
  );
}
