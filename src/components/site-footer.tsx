import Link from "next/link";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/logo";
import { Container } from "@/components/ui";

export function SiteFooter() {
  const t = useTranslations("footer");
  const nav = useTranslations("nav");

  // Rendered on the server at request/build time; fine for a copyright year.
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <Container className="py-12">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <Logo width={130} />
            <p className="mt-2 text-sm text-fg-muted">{t("tagline")}</p>
          </div>

          <nav aria-label={t("product")}>
            <p className="text-sm font-semibold">{t("product")}</p>
            <ul className="mt-3 space-y-2 text-sm text-fg-muted">
              <li>
                <Link href="/how-it-works" className="hover:text-fg">
                  {nav("howItWorks")}
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-fg">
                  {nav("pricing")}
                </Link>
              </li>
              <li>
                <Link href="/performance" className="hover:text-fg">
                  {nav("performance")}
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label={t("legal")}>
            <p className="text-sm font-semibold">{t("legal")}</p>
            <ul className="mt-3 space-y-2 text-sm text-fg-muted">
              {/* P2-104: the risk disclosure is linked from every footer. */}
              <li>
                <Link href="/risk-disclosure" className="hover:text-fg">
                  {t("riskDisclosure")}
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-fg">
                  {t("terms")}
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-fg">
                  {t("privacy")}
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-10 border-t border-border pt-6">
          <p className="max-w-3xl text-xs leading-relaxed text-fg-muted">
            {t("disclaimer")}
          </p>
          <p className="mt-4 text-xs text-fg-muted">{t("rights", { year })}</p>
        </div>
      </Container>
    </footer>
  );
}
