import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Investor } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

/**
 * P2-106 — the investors row is created here, after the email is verified,
 * rather than by a trigger on auth.users.
 *
 * Two reasons. A trigger would have to be added to a table this project does
 * not own, alongside the company site's existing on_auth_user_created — and
 * two triggers on one table is how you get a signup that half-succeeds. And a
 * trigger fires at signup, before verification, which would leave rows for
 * every address someone typed and never confirmed.
 *
 * Idempotent: the auth callback runs on every sign-in, not only the first.
 */
export async function ensureInvestor(
  supabase: Client,
  userId: string,
): Promise<Investor | null> {
  const existing = await supabase
    .from("investors")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing.data) return existing.data;

  // HS-BOT-v4 §1. The choice is made at signup, before the row exists — the
  // row is created here, after the address is verified — so it travels on the
  // auth user's metadata and is read back off it.
  //
  // Defaults to 'investor' when absent, which covers an OAuth signup that
  // never passed through our form and every account created before account
  // types existed. 'investor' is the safe default: it grants nothing on its
  // own, because an investor still cannot trade until an admin links their
  // broker account by hand. Defaulting to 'trader' would hand somebody the
  // paid product by accident.
  const { data: auth } = await supabase.auth.getUser();
  const chosen = auth.user?.user_metadata?.account_type;
  const accountType = chosen === "trader" ? "trader" : "investor";

  const inserted = await supabase
    .from("investors")
    .insert({ user_id: userId, account_type: accountType })
    .select()
    .maybeSingle();

  if (inserted.error) {
    // 23505 = unique violation: a concurrent request won the race. Not an
    // error from the user's point of view — read the row they created.
    if (inserted.error.code === "23505") {
      const raced = await supabase
        .from("investors")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      return raced.data ?? null;
    }
    console.error("[investors] insert failed:", inserted.error);
    return null;
  }

  return inserted.data ?? null;
}

/** The signed-in investor's row. RLS means this can only ever be their own. */
export async function getInvestor(supabase: Client): Promise<Investor | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data } = await supabase
    .from("investors")
    .select("*")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  return data ?? null;
}
