import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";

export const metadata: Metadata = {
  title: "Check your email",
  robots: { index: false },
};

export default async function VerifyEmailPage({
  searchParams,
}: PageProps<"/app/verify-email">) {
  const t = await getTranslations("auth.verifyEmail");
  const params = await searchParams;
  const raw = params.email;
  const email = (Array.isArray(raw) ? raw[0] : raw) ?? "";

  return (
    <AuthCard title={t("title")}>
      <p className="text-sm leading-relaxed text-fg-muted">
        {/* Echoed back so a typo is obvious before they go hunting in spam. */}
        {t("body", { email: email || "your email address" })}
      </p>

      <p className="mt-8 text-sm">
        <Link
          href="/app/login"
          className="text-accent underline underline-offset-2"
        >
          {t("backToSignIn")}
        </Link>
      </p>
    </AuthCard>
  );
}
