import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { AdminNav } from "@/components/admin/admin-nav";
import { Container } from "@/components/ui";
import { getAdmin, recordAdminLogin } from "@/lib/admin";

export const dynamic = "force-dynamic";

/**
 * The admin area.
 *
 * The guard lives here rather than in each page: a layout wraps every route
 * beneath it, so a new admin page is protected the moment it is created
 * instead of depending on whoever adds it remembering. The pages keep their
 * own check as well — defence in depth is cheap and this is the boundary
 * between one investor's data and everyone's.
 *
 * notFound(), not a "forbidden" page: a non-admin should not learn these URLs
 * are real.
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const admin = await getAdmin();
  if (!admin) notFound();

  // Staff login activity. Keyed on the auth system's own last_sign_in_at, so
  // this writes once per actual sign-in no matter how many admin pages get
  // loaded in the session. Never throws: an audit convenience must not be
  // able to keep staff out of the panel.
  await recordAdminLogin(admin.userId, admin.lastSignInAt);

  // A1. A seeded password is a known password, and this account can disable
  // users and read financials. Blocked here rather than on each page, so a
  // route added later is covered the moment it exists.
  if (admin.mustChangePassword) redirect("/app/admin/change-password");

  const t = await getTranslations("dashboard.nav");

  // Only the sections this admin can actually open. The pages 404 without the
  // permission regardless; this stops the sidebar advertising them.
  const items = [
    { href: "/app/admin", label: t("adminOverview"), icon: "overview" as const },
    ...(admin.permissions.includes("users.view")
      ? [{ href: "/app/admin/users", label: t("adminUsers"), icon: "users" as const }]
      : []),
    ...(admin.permissions.includes("bot.view")
      ? [{ href: "/app/admin/bot", label: t("adminBot"), icon: "bot" as const }]
      : []),
    { href: "/app/admin/links", label: t("adminLinks"), icon: "links" as const },
    ...(admin.permissions.includes("bot.view")
      ? [{ href: "/app/admin/trading", label: t("adminTrading"), icon: "trading" as const }]
      : []),
    ...(admin.permissions.includes("admins.manage")
      ? [{ href: "/app/admin/admins", label: t("adminAdmins"), icon: "admins" as const }]
      : []),
    ...(admin.permissions.includes("finance.view")
      ? [
          {
            href: "/app/admin/billing",
            label: t("adminBilling"),
            icon: "billing" as const,
          },
        ]
      : []),
  ];

  return (
    <>
      <header className="border-b border-border">
        <Container className="flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Highzcore
            </Link>
            <span className="rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </Container>
      </header>

      <Container className="py-8">
        <div className="gap-8 lg:grid lg:grid-cols-[14rem_1fr]">
          <aside className="lg:sticky lg:top-8 lg:self-start">
            <AdminNav items={items} />

            {/* A way back to the investor view. An admin is also a user, and
                without this the only route out is editing the URL. */}
            <Link
              href="/app/dashboard"
              className="mt-6 inline-flex items-center gap-2 text-sm text-fg-muted transition-colors hover:text-fg"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              {t("overview")}
            </Link>
          </aside>

          <main className="mt-8 min-w-0 lg:mt-0">{children}</main>
        </div>
      </Container>
    </>
  );
}
