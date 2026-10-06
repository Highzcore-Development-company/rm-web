import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/password-forms";

export const metadata: Metadata = {
  title: "Set a new password",
  robots: { index: false },
};

/**
 * Reached from the reset email, via /auth/callback — which exchanges the
 * recovery code for a session first. Without that session the update call has
 * nothing to act on, which is why this is not linked from anywhere else.
 */
export default function ResetPasswordPage() {
  const t = useTranslations("auth.resetPassword");

  return (
    <AuthCard title={t("title")}>
      <ResetPasswordForm />
    </AuthCard>
  );
}
