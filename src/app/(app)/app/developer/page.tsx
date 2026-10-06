import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app-shell";
import { KeyManager, type KeyRow } from "@/components/developer/key-manager";
import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getInvestor } from "@/lib/investors";
import { RATE_LIMIT_PER_MINUTE } from "@/lib/api-keys";
import { callsInLast24Hours } from "@/lib/api-usage";

export const metadata: Metadata = {
  title: "Developer",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/** P2-601 + P2-607 — keys and usage. */
export default async function DeveloperPage() {
  const t = await getTranslations("developer");
  const supabase = await createClient();
  const investor = await getInvestor(supabase);

  const keysResult = investor
    ? await supabase
        .from("api_keys")
        .select("id, name, key_prefix, created_at, last_used_at, revoked_at")
        .eq("investor_id", investor.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  const keys = (keysResult.data ?? []) as unknown as KeyRow[];

  const calls = await callsInLast24Hours(supabase);

  return (
    <AppShell active="developer">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-muted">
        {t("intro")}
      </p>
      <Link
        href="/api-docs"
        className="mt-3 inline-block text-sm text-accent underline underline-offset-2"
      >
        {t("docsLink")}
      </Link>

      <section className="mt-10">
        <Card>
          <h2 className="text-lg font-semibold">{t("keys.title")}</h2>
          <KeyManager keys={keys} />
        </Card>
      </section>

      <section className="mt-8 max-w-sm">
        <Card>
          <h2 className="text-lg font-semibold">{t("usage.title")}</h2>
          <p className="mt-4 text-xs uppercase tracking-wide text-fg-muted">
            {t("usage.calls")}
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {calls.toLocaleString("en-US")}
          </p>
          <p className="mt-4 text-xs leading-relaxed text-fg-muted">
            {t("usage.limit", { limit: RATE_LIMIT_PER_MINUTE })}
          </p>
        </Card>
      </section>
    </AppShell>
  );
}
