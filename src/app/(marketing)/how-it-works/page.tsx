import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import {
  Banknote,
  FileSignature,
  LogOut,
  ShieldCheck,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { ButtonLink, Container } from "@/components/ui";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "You open your own Vantage account, fund it, and grant trade permission only. We never hold your funds.",
};

/**
 * Each step gets a mark. Five headings over five paragraphs is correct and
 * unreadable — the eye has nothing to land on, so the page reads as a wall and
 * people skim past the one step that matters (the LPOA).
 */
const STEPS: { key: string; Icon: LucideIcon }[] = [
  { key: "open", Icon: UserPlus },
  { key: "fund", Icon: Banknote },
  { key: "lpoa", Icon: FileSignature },
  { key: "trade", Icon: ShieldCheck },
  { key: "disconnect", Icon: LogOut },
];

export default function HowItWorksPage() {
  const t = useTranslations("howItWorks");

  return (
      <Container className="py-16 sm:py-24">
        <div className="max-w-3xl">
          <h1 className="display text-4xl font-semibold sm:text-6xl">
            {t("title")}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-fg-muted">
            {t("intro")}
          </p>
        </div>

        <Stagger as="ol" className="relative mt-14 max-w-3xl">
          {/* The spine. Without it five cards are five unrelated boxes; with
              it they are a sequence, which is the whole point of the page. */}
          <span
            aria-hidden="true"
            className="absolute left-[27px] top-8 bottom-8 hidden w-px bg-gradient-to-b from-accent/40 via-border to-transparent sm:block"
          />

          {STEPS.map(({ key, Icon }, index) => (
            <StaggerItem as="li" key={key} className="relative pb-5">
              <div className="surface flex gap-5 rounded-xl border border-border p-5 sm:p-6">
                <div className="relative shrink-0">
                  <span className="flex size-14 items-center justify-center rounded-xl border border-accent/25 bg-accent/10 text-accent">
                    <Icon className="size-6" aria-hidden="true" />
                  </span>
                  <span
                    aria-hidden="true"
                    className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold tabular-nums text-[#0A0A0A]"
                  >
                    {index + 1}
                  </span>
                </div>

                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">
                    {t(`steps.${key}.title`)}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                    {t(`steps.${key}.body`)}
                  </p>
                </div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        {/* P2-102 — states plainly that we never hold funds. Given its own
            treatment because it is the objection everyone arrives with. */}
        <Reveal className="mt-10 max-w-3xl">
          <div className="surface-raised relative overflow-hidden rounded-xl border border-accent/30 p-6 sm:p-8">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-accent/10 blur-3xl"
            />
            <div className="flex items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent text-[#0A0A0A]">
                <ShieldCheck className="size-6" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-lg font-semibold">{t("custody.title")}</h2>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                  {t("custody.body")}
                </p>
              </div>
            </div>
          </div>
        </Reveal>

        <div className="mt-12">
          <ButtonLink href="/app/signup">{t("cta")}</ButtonLink>
        </div>
      </Container>
  );
}
