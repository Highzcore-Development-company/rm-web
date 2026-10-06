import { getTranslations } from "next-intl/server";
import { PageTransition } from "@/components/motion";
import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/server";
import { SiteFooter } from "@/components/site-footer";

export default async function MarketingLayout({
  children,
}: LayoutProps<"/">) {
  const t = await getTranslations("nav");

  // getUser rather than getSession: it verifies the token with Supabase
  // instead of trusting whatever is in the cookie.
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#0A0A0A]"
      >
        {t("skipToContent")}
      </a>
      <SiteHeader signedIn={Boolean(auth.user)} />
      <main id="main" className="ambient relative flex flex-1 flex-col">
        <PageTransition>{children}</PageTransition>
      </main>
      <SiteFooter />
    </>
  );
}
