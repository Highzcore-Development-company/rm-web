import Link from "next/link";
import { ArrowRight, Bot, CircleCheck } from "lucide-react";

/**
 * The bridge between the two products.
 *
 * Product 1 — the analysis — is what the dashboard opens on, because it is
 * what everyone can use on day one and it is what we are selling. Product 2,
 * letting our bot trade a broker account in the customer's own name, is one
 * line above it rather than a wall in front of it. Signing in used to land
 * people on the Vantage setup checklist, which asked for a broker account
 * before showing a single thing worth having one for.
 *
 * Three states, because "set up managed trading" is the wrong sentence to show
 * someone who already has.
 */
export function BotTradeBanner({
  linked,
  trading,
}: {
  /** Investor has a Vantage account claimed and linked. */
  linked: boolean;
  /** The bot currently has permission to trade it. */
  trading: boolean;
}) {
  if (linked && trading) {
    return (
      <div className="flex items-center gap-2.5 rounded-sm border border-success/40 bg-success/10 px-3 py-1.5 text-xs">
        <CircleCheck className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
        <span className="text-fg">Our bot is trading your account</span>
        <Link
          href="/app/onboarding"
          className="ml-auto shrink-0 text-fg-subtle underline underline-offset-2 hover:text-fg"
        >
          Manage
        </Link>
      </div>
    );
  }

  return (
    <Link
      href="/app/onboarding"
      className="group flex items-center gap-2.5 rounded-sm border border-brand/40 bg-brand/10 px-3 py-1.5 text-xs transition-colors hover:bg-brand/15"
    >
      <Bot className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
      <span className="text-fg">
        {linked
          ? "Your account is linked — switch on managed trading"
          : "Let our bot trade for you"}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1 text-brand">
        Set up
        <ArrowRight
          className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </span>
    </Link>
  );
}
