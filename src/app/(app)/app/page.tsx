import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getInvestor } from "@/lib/investors";
import { landingPathFor } from "@/lib/landing";

/**
 * /app had no page, so it 404'd — an obvious URL to type, and the one people
 * shorten to when telling someone where the product lives.
 *
 * HS-BOT-v4 §1: it now routes on the account type rather than sending
 * everybody to the same screen, through the one helper so every entry point
 * agrees about where an account belongs.
 */
export default async function AppIndexPage() {
  const supabase = await createClient();
  const investor = await getInvestor(supabase);
  redirect(landingPathFor(investor?.account_type ?? null));
}
