import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { OtpForm } from "@/components/auth/otp-form";

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

  // Without an address there is nothing to verify against — verifyOtp needs
  // both halves. Sending them back to sign in is better than a form that
  // cannot succeed whatever they type.
  if (!email) {
    return (
      <AuthCard title={t("title")}>
        <p className="text-sm leading-relaxed text-fg-muted">
          {t("body", { email: "your email address" })}
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

  return (
    <AuthCard
      title={t("codeTitle")}
      intro={t("codeIntro", { email })}
      footer={
        <Link
          href="/app/login"
          className="text-accent underline underline-offset-2"
        >
          {t("backToSignIn")}
        </Link>
      }
    >
      <OtpForm email={email} />
    </AuthCard>
  );
}
