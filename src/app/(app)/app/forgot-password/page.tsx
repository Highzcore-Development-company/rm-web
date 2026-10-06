import type { Metadata } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/password-forms";

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false },
};

export default function ForgotPasswordPage() {
  const t = useTranslations("auth.forgotPassword");

  return (
    <AuthCard
      title={t("title")}
      intro={t("intro")}
      footer={
        <Link
          href="/app/login"
          className="text-accent underline underline-offset-2"
        >
          {t("back")}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
