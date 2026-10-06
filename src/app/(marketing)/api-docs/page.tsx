import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, Container } from "@/components/ui";
import { RATE_LIMIT_PER_MINUTE } from "@/lib/api-keys";

export const metadata: Metadata = {
  title: "API documentation",
  description:
    "JSON API over the published performance figures. Bearer auth, documented rate limits.",
};

const ENDPOINTS = [
  {
    key: "performance",
    method: "GET",
    path: "/api/v1/performance",
    curl: `curl https://highzcore.com/api/v1/performance \
  -H "Authorization: Bearer hz_live_..."`,
    js: `const res = await fetch("https://highzcore.com/api/v1/performance", {
  headers: { Authorization: \`Bearer \${process.env.HIGHZCORE_KEY}\` },
});
if (res.status === 503) {
  // No trustworthy figures right now. Not the same as zero — show nothing.
  return null;
}
const { data } = await res.json();`,
  },
  {
    key: "markets",
    method: "GET",
    path: "/api/v1/markets",
    curl: `curl https://highzcore.com/api/v1/markets \
  -H "Authorization: Bearer hz_live_..."`,
    js: `const res = await fetch("https://highzcore.com/api/v1/markets", {
  headers: { Authorization: \`Bearer \${process.env.HIGHZCORE_KEY}\` },
});
const { data } = await res.json();
const open = data.filter((m) => m.open);`,
  },
  {
    key: "signals",
    method: "GET",
    path: "/api/v1/signals",
    curl: `curl https://highzcore.com/api/v1/signals \
  -H "Authorization: Bearer hz_live_..."`,
    js: `// Returns 403 while signals are not open on the public API.
const res = await fetch("https://highzcore.com/api/v1/signals", {
  headers: { Authorization: \`Bearer \${process.env.HIGHZCORE_KEY}\` },
});`,
  },
] as const;

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-bg p-4 text-xs leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

/** P2-606 — the API docs site. */
export default async function ApiDocsPage() {
  const t = await getTranslations("apiDocs");

  return (
    <Container className="py-16 sm:py-24">
      <div className="max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("title")}
        </h1>
        <p className="mt-6 text-lg text-fg-muted">{t("intro")}</p>

        <div className="mt-12 space-y-10">
          <section>
            <h2 className="text-xl font-semibold">{t("auth.title")}</h2>
            <p className="mt-3 text-sm leading-relaxed text-fg-muted">
              {t("auth.body")}
            </p>
            <Code>{`Authorization: Bearer hz_live_...`}</Code>
          </section>

          <section>
            <h2 className="text-xl font-semibold">{t("limits.title")}</h2>
            <p className="mt-3 text-sm leading-relaxed text-fg-muted">
              {t("limits.body", { limit: RATE_LIMIT_PER_MINUTE })}
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">{t("errors.title")}</h2>
            <p className="mt-3 text-sm leading-relaxed text-fg-muted">
              {t("errors.body")}
            </p>
            <Code>{`{ "error": "rate_limited", "message": "Limit is 60 requests per minute." }`}</Code>
          </section>
        </div>

        <h2 className="mt-16 text-xl font-semibold">{t("endpoints.title")}</h2>
        <div className="mt-6 space-y-6">
          {ENDPOINTS.map((e) => (
            <Card key={e.key}>
              <p className="flex flex-wrap items-center gap-3 font-mono text-sm">
                <span className="rounded bg-accent px-2 py-0.5 text-xs font-semibold text-[#0A0A0A]">
                  {e.method}
                </span>
                {e.path}
              </p>
              <p className="mt-3 text-sm text-fg-muted">{t(`${e.key}.summary`)}</p>
              <Code>{e.curl}</Code>
              <Code>{e.js}</Code>
            </Card>
          ))}
        </div>

        <p className="mt-12 text-sm">
          <Link href="/api-terms" className="text-accent underline underline-offset-2">
            {t("termsLink")}
          </Link>
        </p>
      </div>
    </Container>
  );
}
