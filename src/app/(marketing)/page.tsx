import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Hero } from "@/components/hero";
import { PerformanceStrip } from "@/components/performance-strip";
import { Analysis } from "@/components/sections/analysis";
import { CtaBand } from "@/components/sections/cta-band";
import { Faq } from "@/components/sections/faq";
import { Managed } from "@/components/sections/managed";
import { Plans } from "@/components/sections/plans";
import { Steps } from "@/components/sections/steps";

/**
 * Metadata leads with the term people search. "Highzcore" alone is
 * unsearchable — nobody is looking for us yet — so the title carries the
 * category instead, and the brand trails it.
 *
 * "AI trading analysis" rather than "copy trading": it is the product we
 * intend to sell, and it is far less contested than a term every signal
 * seller on the internet is bidding on.
 */
export const metadata: Metadata = {
  title: "AI Trading Analysis for Forex and Crypto",
  description:
    "Our AI reads volatility, trend structure and risk across 30 forex and crypto markets, in plain English, before you place the trade. You still make every call. Free to start.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Highzcore",
    title: "AI Trading Analysis for Forex and Crypto | Highzcore",
    description:
      "Know what the market is doing before you trade it. Volatility, trend and risk across 30 markets, read by AI.",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Trading Analysis for Forex and Crypto | Highzcore",
    description:
      "Know what the market is doing before you trade it. Volatility, trend and risk across 30 markets, read by AI.",
  },
};

/**
 * Two products, one page, in the order an unconvinced trader needs them:
 *
 *   Hero         Scora — the thing we are selling
 *   Performance  proof, before any claims
 *   Analysis     what it actually reads, as four questions
 *   Steps        how you use it
 *   Plans        what it costs
 *   Managed      the second product, as an alternative not a second pitch
 *   FAQ          everything else
 *   CTA          somewhere to go after reading it all
 *
 * Managed sits AFTER pricing now. It used to come third, followed by a full
 * custody section, which read as though the bot were the main product and
 * Scora the sideline — the opposite of how this is sold. Scora is self-serve
 * and closes on the page; managed trading closes on a call, so its only job
 * here is to send the right visitor to /investors.
 */
export default async function HomePage() {
  // A signed-in visitor landing on the pitch has to find their own way in.
  // getUser rather than getSession: it verifies the token with Supabase rather
  // than trusting a cookie that may be stale or forged.
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user) redirect("/app/dashboard");

  return (
    <>
      <Hero />
      <PerformanceStrip />
      <Analysis />
      {/* Scora's own three steps, then its price. The managed service comes
          after both, as the alternative it is — the homepage sells Scora.

          Custody used to sit here, a full section on why we cannot touch your
          money. That answers a question only a managed-trading prospect is
          asking, and asking it on the front page implied the bot was the main
          product. It now lives on /investors, where the people who need it
          are. */}
      <Steps />
      <Plans />
      <Managed />
      <Faq />
      <CtaBand />
    </>
  );
}
