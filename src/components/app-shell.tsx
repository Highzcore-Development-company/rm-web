import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Container } from "@/components/ui";

/**
 * P2-501 — the signed-in shell.
 *
 * No admin controls here, by design: this is the investor surface, and the
 * admin screens live behind their own route guard. A UI that renders admin
 * links and relies on the server to refuse them teaches people to try.
 */
export async function AppShell({
  children,
  active,
}: {
  children: ReactNode;
  active?: "overview" | "link" | "billing" | "developer";
}) {
  const t = await getTranslations("dashboard.nav");

  const items = [
    { key: "overview", href: "/app/dashboard", label: t("overview") },
    { key: "link", href: "/app/link-account", label: t("link") },
    { key: "billing", href: "/app/checkout", label: t("billing") },
    { key: "developer", href: "/app/developer", label: t("developer") },
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
