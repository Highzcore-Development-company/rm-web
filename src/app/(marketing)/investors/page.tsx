import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { Custody } from "@/components/sections/custody";
import { EnquiryForm } from "@/components/investors/enquiry-form";
import { Container, Eyebrow } from "@/components/ui";

export const metadata: Metadata = {
  title: "For investors",
  description:
    "Managed trading for businesses. Tell us about yours and we will set up a call.",
};

/**
 * The managed-trading path, which does not self-serve.
 *
 * Scora is bought on the site; this is not. A business that wants the
 * analysis acted on for them gets a conversation first — what they trade, how
 * much, and what they need to see — and we set the account and dashboard up
 * with them afterwards. So this page's only conversion is the form.
 *
 * CUSTODY LIVES HERE NOW. It used to be a full section on the landing page,
 * which put "we cannot take your money" in front of every visitor including
 * the ones who only ever wanted market analysis — and implied the bot was the
 * main product. It is the single biggest objection for THIS reader, and
 * nobody else was asking it.
 *
 * It sits below the form rather than above it: the people who arrive from the
 * homepage band already know what they want, and the ones who need
 * convincing scroll.
 */
export default function InvestorsPage() {
  const t = useTranslations("investors");

  return (
    <>
      <Container className="py-20 sm:py-28">
        <div className="max-w-2xl">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h1 className="display mt-4 text-4xl sm:text-5xl">{t("title")}</h1>
          <p className="mt-6 text-lg leading-relaxed text-fg-muted">{t("intro")}</p>
        </div>

        <div className="mt-14 grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
          <div>
            <h2 className="text-xl font-semibold">{t("what.title")}</h2>
            <ol className="mt-6 space-y-6">
              {(["talk", "setup", "watch"] as const).map((key, i) => (
                <li key={key} className="flex gap-4">
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border font-mono text-sm text-fg-muted"
                  >
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-medium">{t(`what.${key}.title`)}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
                      {t(`what.${key}.body`)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div id="enquiry" className="surface-raised rounded-2xl border border-border p-6 sm:p-8">
            <h2 className="text-xl font-semibold">{t("form.title")}</h2>
            <p className="mt-2 text-sm text-fg-muted">{t("form.intro")}</p>
            <div className="mt-7">
              <EnquiryForm />
            </div>
          </div>
        </div>
        {/* The mechanics, below the form. These were the five steps behind
            "How it works" in the navbar, which told every visitor the bot was
            the product. They are exactly right for this reader and nobody
            else — the detail someone weighing this up needs before a call. */}
        <div className="mt-20 max-w-3xl">
          <h2 className="text-xl font-semibold">{t("mechanics.title")}</h2>
          <p className="mt-3 text-fg-muted">{t("mechanics.intro")}</p>

          <ol className="mt-8 space-y-5">
            {(["open", "fund", "lpoa", "trade", "disconnect"] as const).map((key, i) => (
              <li key={key} className="surface flex gap-5 rounded-xl border border-border p-5">
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-accent/25 bg-accent/10 font-mono text-sm text-accent"
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="font-semibold">{t(`mechanics.steps.${key}.title`)}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
                    {t(`mechanics.steps.${key}.body`)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Container>

      <Custody />
    </>
  );
}
