import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { Container } from "@/components/ui";

export const metadata: Metadata = {
  title: "Risk disclosure",
  description:
    "Trading carries risk of loss. Past performance does not predict future results. AI can make mistakes.",
};

/**
 * P2-104 — risk disclosure.
 *
 * Linked from every footer (see site-footer.tsx) and shown during signup. The
 * signup presentation is built with P2-106 and reuses these same messages, so
 * the two can never drift apart.
 */
export default function RiskDisclosurePage() {
  const t = useTranslations("risk");
  const sections = ["loss", "past", "ai", "noAdvice", "custody"] as const;

  return (
    <Container className="py-16 sm:py-24">
      <div className="max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("title")}
        </h1>
        <p className="mt-6 text-lg text-fg-muted">{t("intro")}</p>

        <div className="mt-12 space-y-10">
          {sections.map((key) => (
            <section key={key}>
              <h2 className="text-xl font-semibold">{t(`${key}.title`)}</h2>
              <p className="mt-3 text-sm leading-relaxed text-fg-muted">
                {t(`${key}.body`)}
              </p>
            </section>
          ))}
        </div>
      </div>
    </Container>
  );
}
