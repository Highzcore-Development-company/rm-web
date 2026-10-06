import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "API terms",
  description: "What you may and may not do with our data and signals.",
};

/** P2-608 — API terms. Wording is a draft; D2 covers it. */
export default function ApiTermsPage() {
  const t = useTranslations("apiTerms");
  const keys = ["use", "resale", "accuracy", "revoke"] as const;

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
