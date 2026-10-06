import type { Investor } from "@/lib/supabase/types";

/**
 * P2-108 — the onboarding checklist.
 *
 * Derives done/not-done for each step from what we can actually observe. The
 * honest part is `verifiable`: we have no sight of an investor's Vantage
 * balance until the MAM exposes one, so the funding step cannot be ticked by
 * us. Showing a green tick we cannot substantiate would be worse than showing
 * none — it would tell someone their account is funded when we do not know.
 */

export type StepKey = "account" | "fund" | "link" | "subscribe";

export type Step = {
  key: StepKey;
  done: boolean;
  /** False when we cannot observe this and the investor must confirm it. */
  verifiable: boolean;
  href: string;
};

export function stepsFor(investor: Investor | null): Step[] {
  const hasAccount = Boolean(investor?.vantage_account_id);
  const confirmed =
    investor?.status === "linked" || investor?.status === "active";

  return [
    {
      // Claiming a login is the only evidence we get that an account exists.
      key: "account",
      done: hasAccount,
      verifiable: true,
      href: "/app/link-account",
    },
    {
      key: "fund",
      done: false,
      verifiable: false,
      href: "/how-it-works",
    },
    {
      // Done only once an admin has confirmed the link against the Vantage MAM
      // panel (P2-204). Claiming an account is not the same as being linked.
      key: "link",
      done: confirmed,
      verifiable: true,
      href: "/app/link-account",
    },
    {
      // TODO(E3): read the subscriptions table once P2-302 exists. Until then
      // 'active' is the only signal that someone is both linked and paid up,
      // because that is what an admin sets when both are true.
      key: "subscribe",
      done: investor?.status === "active",
      verifiable: true,
      href: "/pricing",
    },
  ];
}
