import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of service",
  description:
    "Trade permission only, never withdrawal. What the subscription covers and how to end it.",
};

export default function TermsPage() {
  const t = useTranslations("legal.terms");

  // "permission" is first deliberately: trade-only, never withdrawal, is the
  // single most important thing these terms have to say.
  const keys = [
    "permission",
    "subscription",
    "noGuarantee",
    "termination",
    "attribution",
  ] as const;

  return (
    <LegalPage
      title={t("title")}
      draftNotice={t("draft")}
      sections={keys.map((key) => ({
        key,
        title: t(`${key}.title`),
        body: t(`${key}.body`),
      }))}
    />
  );
}
