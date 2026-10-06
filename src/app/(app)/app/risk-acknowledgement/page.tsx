import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { RiskAcknowledgement } from "@/components/auth/risk-acknowledgement";

export const metadata: Metadata = {
  title: "Before you continue",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/**
 * P2-104 — the disclosure, for everyone.
 *
 * Email signup ticks its own box in the form; Google signup never saw one.
 * This catches whoever has not acknowledged, whichever door they came through,
 * and the app layout holds them here until they do.
 */
export default async function RiskAcknowledgementPage() {
  const t = await getTranslations("auth.riskGate");

  return (
    <AuthCard title={t("title")} intro={t("intro")}>
      <RiskAcknowledgement />
    </AuthCard>
  );
}
