import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Clapperboard,
  Megaphone,
  Music,
  Radio,
  Search,
  Tv,
} from "lucide-react";
import { PACKAGES } from "@/lib/studio/catalog";
import { PackageCard } from "@/components/marketing/package-card";
import { StudioSpectrum } from "@/components/marketing/studio-spectrum";
import { StudioReel } from "@/components/marketing/studio-reel";
import { listStudioWorks } from "@/lib/studio";

export const metadata: Metadata = {
  title: "Custom songs and business jingles — Highscore Studio",
  description:
    "We make businesses famous. Custom songs, jingles and advert videos from " +
    "Lagos — then we put them everywhere your customers are. Social, radio, " +
    "live TV, billboards.",
  alternates: { canonical: "/studio" },
};

export const dynamic = "force-dynamic";

/**
 * studio.highzcore.tech — highscore-tech-web's /studio, reproduced.
 *
 * Esther: "whatever you see in this highscore tech web portfolio and studio
 * is what I want — the UI and the UX, except the colour." Their sections, in
 * their order:
 *
 *   hero        a pill, the big headline with its accent half, the sub, two
 *               buttons, the price line, and the spectrum behind it
 *   what we do  six capability cards
 *   the work    OURS, added — see below
 *   why us      the "anyone can hold the tools" panel
 *   pricing     personal packages, then business
 *
 * THE WORK IS ADDED, not ported. Theirs lives on a separate /studio/work
 * page; nine films are the studio's entire argument and there is no reason
 * to make somebody navigate for them. The hero's second button scrolls here
 * rather than leaving.
 *
 * NOT PORTED, and said rather than quietly dropped:
 *
 *   - the photo backdrop, which is their /studio-hero.jpg and not ours
 *   - the JSON-LD FAQ block, which belongs with content somebody has
 *     approved for this domain
 *   - the three.js spectrum, replaced by CSS bars — see StudioSpectrum
 *   - the order flow. Every "start your order" there opens an AlatPay
 *     checkout we do not have, so the buttons say what we can actually do.
 *     A button promising a checkout and delivering a 404 is worse than an
 *     honest one.
 */

const WHAT_WE_DO = [
  {
    icon: <Music className="size-5" aria-hidden="true" />,
    title: "Custom songs & jingles",
    body: "A song written about your business, your event, or the person you love. Yours to keep.",
  },
  {
    icon: <Clapperboard className="size-5" aria-hidden="true" />,
    title: "Promo videos",
    body: "Filmed live or made with AI — we can turn your photos into moving video.",
  },
  {
    icon: <Radio className="size-5" aria-hidden="true" />,
    title: "Radio campaigns",
    body: "Jingles written for air, delivered in broadcast format for any station.",
  },
  {
    icon: <Tv className="size-5" aria-hidden="true" />,
    title: "Live TV promotion",
    body: "Commercials produced and placed — your brand on live television.",
  },
  {
    icon: <Megaphone className="size-5" aria-hidden="true" />,
    title: "Outdoor branding",
    body: "Billboards, banners, signage, vehicle and shop-front branding.",
  },
  {
    icon: <Search className="size-5" aria-hidden="true" />,
    title: "Google ranking & ads",
    body: "Rank on Google and run paid ads that put you in front of buyers.",
  },
];

export default async function StudioPage() {
  const works = await listStudioWorks();
  const personal = PACKAGES.filter((p) => p.group === "personal");
  const business = PACKAGES.filter((p) => p.group === "business");

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden px-4 pb-40 pt-20 md:px-8 md:pb-48 md:pt-28">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-20"
          style={{
            background:
              "linear-gradient(180deg, color-mix(in srgb, var(--bg) 58%, transparent) 0%, color-mix(in srgb, var(--bg) 70%, transparent) 55%, var(--bg) 100%), " +
              "radial-gradient(70% 55% at 50% 0%, color-mix(in srgb, var(--accent) 14%, transparent) 0%, transparent 70%)",
          }}
        />
        <div className="absolute inset-0 -z-10">
          <StudioSpectrum />
        </div>

        <div className="relative mx-auto max-w-[900px] text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-accent">
            Highscore Studio
          </p>
          <h1 className="display mt-6 text-[40px] font-extrabold leading-[1.03] tracking-[-0.035em] sm:text-6xl md:text-7xl">
            We make your business{" "}
            <span className="text-accent">impossible to ignore.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-fg-muted sm:text-lg md:text-xl">
            Custom songs, jingles and videos that people actually remember —
            then we put them everywhere your customers are. Social, radio, live
            TV, billboards.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/contact?from=studio"
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot"
            >
              Start your order
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              href="#work"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-3 text-sm font-semibold text-fg-muted transition-colors hover:text-fg"
            >
              Hear our work
            </Link>
          </div>
          <p className="mt-6 text-sm text-fg-subtle">
            Occasion songs from{" "}
            <span className="font-bold text-accent">₦45,000</span> · business
            packages from{" "}
            <span className="font-bold text-accent">₦180,000</span>, website
            included
          </p>
        </div>
      </section>

      {/* ── What we do ───────────────────────────────────────────── */}
      <section className="border-y border-border bg-surface/40 px-4 py-16 md:px-8 md:py-20">
        <div className="mx-auto max-w-[1180px]">
          <h2 className="display text-center text-3xl font-bold tracking-[-0.02em] md:text-4xl">
            Everything we can do for your brand.
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-5 lg:grid-cols-3">
            {WHAT_WE_DO.map((w) => (
              <div
                key={w.title}
                className="rounded-xl border border-border bg-surface p-5"
              >
                <span className="inline-flex size-10 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  {w.icon}
                </span>
                <h3 className="mt-4 font-semibold">{w.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
                  {w.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── The work ─────────────────────────────────────────────── */}
      <section id="work" className="scroll-mt-20 px-4 py-16 md:px-8 md:py-20">
        <div className="mx-auto max-w-[1180px]">
          <h2 className="display text-center text-3xl font-bold tracking-[-0.02em] md:text-4xl">
            Hear our work.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center leading-relaxed text-fg-muted">
            Adverts, jingles and brand films we have made.
          </p>
          <div className="mt-10">
            <StudioReel works={works} />
          </div>
        </div>
      </section>

      {/* ── Why us ───────────────────────────────────────────────── */}
      <section className="px-4 py-16 md:px-8 md:py-20">
        <div className="mx-auto max-w-[820px] rounded-2xl border border-border bg-surface p-7 md:p-10">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent">
            Why us
          </p>
          <h2 className="display mt-3 text-2xl font-bold tracking-[-0.02em] md:text-3xl">
            Anyone can hold the tools. Not everyone can do this.
          </h2>
          <p className="mt-4 leading-relaxed text-fg-muted">
            Yes, we use AI — and so does anyone with a laptop. The difference is
            what we do with it: the writing, the timing, the taste, and the read
            on <b className="text-fg">your</b> market that turns a clip into a
            campaign. The tools are cheap. Knowing exactly what makes your
            customer stop scrolling is not. That is the part you are paying for,
            and it is why our work lands.
          </p>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────── */}
      <section
        id="pricing"
        className="border-t border-border px-4 py-16 md:px-8 md:py-20"
      >
        <div className="mx-auto max-w-[1180px]">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent">
              Personal &amp; occasions
            </p>
            <h2 className="display mt-3 text-3xl font-bold tracking-[-0.02em] md:text-4xl">
              For the person, or the day.
            </h2>
            <p className="mt-3 leading-relaxed text-fg-muted">
              Birthdays, weddings, anniversaries, church programmes — priced so
              anyone can order one.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {personal.map((p) => (
              <PackageCard key={p.key} pkg={p} />
            ))}
          </div>

          <div className="mx-auto mt-16 max-w-2xl text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent">
              Business &amp; brands
            </p>
            <h2 className="display mt-3 text-3xl font-bold tracking-[-0.02em] md:text-4xl">
              For the business that wants to be heard.
            </h2>
            <p className="mt-3 leading-relaxed text-fg-muted">
              Full commercial rights, scripting built around your offer, and
              masters made for wherever the advert runs.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
            {business.map((p) => (
              <PackageCard key={p.key} pkg={p} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
