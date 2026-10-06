import type { Metadata } from "next";
import { Hero } from "@/components/hero";
import { PerformanceStrip } from "@/components/performance-strip";
import { Analysis } from "@/components/sections/analysis";
import { CtaBand } from "@/components/sections/cta-band";
import { Custody } from "@/components/sections/custody";
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
 *   Hero         the analysis tool — the thing we are selling
 *   Performance  proof, before any claims
 *   Analysis     what it actually reads, as four questions
 *   Managed      the second product, as an alternative not a second pitch
 *   Custody      the objection that stops people — answered before pricing
 *   Steps        what you have to do
 *   Plans        what it costs
 *   FAQ          everything else
 *   CTA          somewhere to go after reading it all
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <PerformanceStrip />
      <Analysis />
      <Managed />
      <Custody />
      <Steps />
      <Plans />
      <Faq />
      <CtaBand />
    </>
  );
}
