import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { AuthCard } from "@/components/auth/auth-card";
import { GoogleButton } from "@/components/auth/google-button";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false },
};

export default function LoginPage() {
  const t = useTranslations("auth.login");

  return (
    <AuthCard
      title={t("title")}
      footer={
        <div className="space-y-2">
          <p>
            <Link
              href="/app/forgot-password"
              className="text-accent underline underline-offset-2"
            >
              {t("forgot")}
            </Link>
          </p>
          <p>
            {t("noAccount")}{" "}
            <Link
              href="/app/signup"
              className="text-accent underline underline-offset-2"
            >
              {t("signUp")}
            </Link>
          </p>
        </div>
      }
    >
      {/* useSearchParams needs a Suspense boundary to stay statically rendered. */}
      <GoogleButton />
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
