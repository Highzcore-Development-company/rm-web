import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { ChangePasswordForm } from "@/components/admin/change-password-form";
import { getAdmin } from "@/lib/admin";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/**
 * A1 — the only admin route reachable while must_change_password is set.
 *
 * Outside the admin layout on purpose: that layout redirects here when a
 * password must be changed, so a page nested inside it would redirect to
 * itself forever.
 *
 * This is why every other admin page lives in admin/(panel)/ — a route group,
 * so the layout covers them without covering this one, and the URLs are
 * unchanged. I had written the comment above before the placement matched it;
 * Samuel caught that every forced-change admin was locked out by an infinite
 * redirect. A comment stating an invariant is not the same as enforcing it.
 */
export default async function ChangeAdminPasswordPage() {
  const t = await getTranslations("admin.changePassword");

  const admin = await getAdmin();
  if (!admin) redirect("/app/login");
  // Nothing to force. Arriving here deliberately is not an error, so it goes
  // where they were trying to get to.
  if (!admin.mustChangePassword) redirect("/app/admin");

  return (
    <AuthCard title={t("title")} intro={t("intro")}>
      <ChangePasswordForm />
    </AuthCard>
  );
}
