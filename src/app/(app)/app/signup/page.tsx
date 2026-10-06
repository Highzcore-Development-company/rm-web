import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui";

export const metadata: Metadata = {
  title: "Sign up",
  robots: { index: false },
};

/**
 * Placeholder. The real signup is P2-106 and needs Supabase auth (P2-008) and
 * the `investors` table (P2-107) first. It exists so the marketing CTAs resolve
 * during development — it must not ship in this state.
 */
export default function SignupPage() {
  return (
    <Container className="py-24">
      <h1 className="text-3xl font-semibold tracking-tight">Sign up</h1>
      <p className="mt-4 max-w-prose text-sm text-fg-muted">
        Not built yet — P2-106, blocked on Supabase auth (P2-008) and the
        investors table (P2-107).
      </p>
      <Link href="/" className="mt-8 inline-block text-sm text-accent underline">
        Back to the site
      </Link>
    </Container>
  );
}
