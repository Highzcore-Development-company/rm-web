import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

/**
 * A way out of a page that is not the dashboard.
 *
 * Deliberately a Link to a known destination rather than router.back(). History
 * is not a reliable "up": someone who arrived from an email, a bookmark or a
 * redirect has nothing behind them, and back() then either does nothing or
 * throws them out of the app entirely.
 */
export async function BackLink({
  href = "/app/dashboard",
  labelKey = "overview",
}: {
  href?: string;
  labelKey?: string;
}) {
  const t = await getTranslations("dashboard.nav");

  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2 text-sm text-fg-muted transition-colors hover:text-fg"
    >
      <ArrowLeft
        className="size-4 transition-transform group-hover:-translate-x-0.5"
        aria-hidden="true"
      />
      {t(labelKey)}
    </Link>
  );
}
