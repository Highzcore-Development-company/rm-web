import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What we collect, what we use it for, and who we share it with. We never store your Vantage password.",
};

export default function PrivacyPage() {
  const t = useTranslations("legal.privacy");
  const keys = ["collect", "use", "share", "rights"] as const;

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
