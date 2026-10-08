"use client";

import { useTranslations } from "next-intl";
import { signOutAndGoHome } from "@/lib/sign-out";

export function SignOutButton() {
  const t = useTranslations("auth");

  return (
    <button
      type="button"
      onClick={signOutAndGoHome}
      className="text-sm text-fg-muted transition-colors hover:text-fg"
    >
      {t("signOut")}
    </button>
  );
}
