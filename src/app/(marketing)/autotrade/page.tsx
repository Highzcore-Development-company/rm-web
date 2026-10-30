import type { Metadata } from "next";
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
  alternates: { canonical: "/autotrade" },
  openGraph: {
    type: "website",
    url: "/autotrade",
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
 * Autotrade's landing page — autotrade.highzcore.tech.
 *
 * THIS WAS THE ROOT OF highzcore.com, and it moved here rather than being
 * rewritten. HS-WEB-v1 gives the root to an index of the whole company and
 * gives each product a door of its own; this is the trading business's page,
 * and Esther placed it behind this door. A page that converts did not need
 * rebuilding — it needed the right address.
 *
 * WORTH KNOWING FOR WHOEVER EDITS IT NEXT: the sections below lead with
 * Scora, and the note under this one still describes that order. So this
 * page currently sells both products, with the analysis half in front. If
 * autotrade is to stand on its own, the split is Hero/Analysis/Steps/Plans
 * to analysis. and Managed/Performance to here — a copy decision rather than
 * a code one, which is why it is flagged rather than guessed at.
 *
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
/**
 * NO LONGER REDIRECTS A SIGNED-IN VISITOR.
 *
 * This page used to be the root, where "you are signed in, go to your
 * dashboard" is a reasonable thing to do with somebody who lands on the
 * pitch. It is a PRODUCT PAGE now, and the same rule makes it unreachable:
 * Esther opened /autotrade, got a header and a footer and nothing between
 * them, and it read as broken. It was not — it was rendering and then
 * navigating away.
 *
 * A landing page has to render for everyone, including the people who built
 * it. The way in is the Dashboard button in the header, which is on every
 * page and is where somebody signed in would look for it anyway.
 */
export default async function AutotradePage() {
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
