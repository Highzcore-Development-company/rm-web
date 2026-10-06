import Link from "next/link";
import { useTranslations } from "next-intl";
import { ThemeToggle } from "@/components/theme-toggle";
import { ButtonLink, Container } from "@/components/ui";

export function SiteHeader() {
  const t = useTranslations("nav");
  const brand = useTranslations("brand");

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg/80 backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-4">
        {/* Wordmark stands in until the brand kit lands (P2-001, blocked on D5). */}
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {brand("name")}
        </Link>

        <nav
          aria-label="Main"
          className="hidden items-center gap-6 text-sm text-fg-muted md:flex"
        >
          <Link href="/how-it-works" className="hover:text-fg">
            {t("howItWorks")}
          </Link>
          <Link href="/pricing" className="hover:text-fg">
            {t("pricing")}
          </Link>
          <Link href="/performance" className="hover:text-fg">
            {t("performance")}
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <ButtonLink href="/signup" className="px-4 py-2">
            {t("getStarted")}
          </ButtonLink>
        </div>
      </Container>
    </header>
  );
}
