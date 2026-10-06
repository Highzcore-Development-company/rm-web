import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Container } from "@/components/ui";
import { isAdmin } from "@/lib/admin";

/**
 * P2-501 — the signed-in shell.
 *
 * Admin entries appear only for actual admins, decided on the server so a
 * non-admin never receives the markup. The pages behind them 404 for
 * non-admins regardless — the nav is for discoverability, never for access.
 */
export async function AppShell({
  children,
  active,
}: {
  children: ReactNode;
  active?:
    | "overview"
    | "link"
    | "billing"
    | "developer"
    | "admin";
}) {
  const t = await getTranslations("dashboard.nav");

  // Rendered only for actual admins. Previously there was no entry point at
  // all, which kept the URLs private but also meant an admin had to know them
  // by heart. Checked on the server, so a non-admin never receives the markup
  // — and the pages still 404 for them regardless.
  const admin = await isAdmin();

  const items = [
    { key: "overview", href: "/app/dashboard", label: t("overview") },
    { key: "link", href: "/app/link-account", label: t("link") },
    { key: "billing", href: "/app/checkout", label: t("billing") },
    { key: "developer", href: "/app/developer", label: t("developer") },
    // One door into the admin area, which has its own side nav once you are
    // inside. Two entries here duplicated that navigation and made the
    // investor nav look like an admin console.
    ...(admin
      ? ([{ key: "admin", href: "/app/admin", label: t("admin") }] as const)
      : []),
  ] as const;

  return (
    <>
      <header className="border-b border-border">
        <Container className="flex h-16 items-center justify-between gap-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Highzcore
          </Link>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </Container>
      </header>

      <nav aria-label="Dashboard" className="border-b border-border">
        <Container>
          <ul className="flex gap-6 overflow-x-auto text-sm">
            {items.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  aria-current={active === item.key ? "page" : undefined}
                  className={`inline-block whitespace-nowrap border-b-2 py-3 transition-colors ${
                    active === item.key
                      ? "border-accent text-fg"
                      : "border-transparent text-fg-muted hover:text-fg"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </nav>

      <Container className="py-10">{children}</Container>
    </>
  );
}
