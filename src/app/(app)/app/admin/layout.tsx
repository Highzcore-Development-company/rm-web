import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { AdminNav } from "@/components/admin/admin-nav";
import { Container } from "@/components/ui";
import { isAdmin } from "@/lib/admin";

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
  if (!(await isAdmin())) notFound();

  const t = await getTranslations("dashboard.nav");

  const items = [
    { href: "/app/admin", label: t("adminOverview"), icon: "overview" as const },
    { href: "/app/admin/links", label: t("adminLinks"), icon: "links" as const },
    {
      href: "/app/admin/billing",
      label: t("adminBilling"),
      icon: "billing" as const,
    },
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
