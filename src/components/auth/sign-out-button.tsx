"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const t = useTranslations("auth");
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    // The session lives in a cookie the server reads, so the cached RSC payload
    // is stale until this runs.
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className="text-sm text-fg-muted transition-colors hover:text-fg"
    >
      {t("signOut")}
    </button>
  );
}
