import type { Metadata } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = {
  title: "Create your account",
  robots: { index: false },
};

/** P2-106 — investor signup. */
export default function SignupPage() {
  const t = useTranslations("auth.signup");

  return (
    <AuthCard
      title={t("title")}
      intro={t("intro")}
      footer={
        <>
          {t("haveAccount")}{" "}
          <Link href="/app/login" className="text-accent underline underline-offset-2">
            {t("signIn")}
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthCard>
  );
}
