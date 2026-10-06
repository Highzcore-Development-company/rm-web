"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getInvestor } from "@/lib/investors";
import { generateApiKey } from "@/lib/api-keys";

export type CreateKeyResult =
  | { ok: true; plaintext: string }
  | { ok: false; error: string };

/**
 * P2-601 — issue a key.
 *
 * The plaintext is returned to the caller once and never stored. Service role
 * writes the row because a client must not be able to choose the hash it is
 * inserting — that would let someone register a key they already knew.
 */
export async function createApiKey(
  _prev: CreateKeyResult | null,
  formData: FormData,
): Promise<CreateKeyResult> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "name" };

  const supabase = await createClient();
  const investor = await getInvestor(supabase);
  if (!investor) return { ok: false, error: "noInvestor" };

  const key = generateApiKey();

  const { error } = await createServiceClient()
    .from("api_keys")
    .insert({
      investor_id: investor.id,
      name,
      key_hash: key.hash,
      key_prefix: key.prefix,
    });

  if (error) {
    console.error("[developer] key creation failed:", error);
    return { ok: false, error: "generic" };
  }

  revalidatePath("/app/developer");

  // This is the only moment the plaintext exists outside the developer's
  // clipboard. We never see it again either.
  return { ok: true, plaintext: key.plaintext };
}

/**
 * Revoke, not delete. Usage rows point at the key, and "which key made these
 * calls" has to stay answerable after it is turned off.
 */
export async function revokeApiKey(keyId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const investor = await getInvestor(supabase);
  if (!investor) return { ok: false };

  const { error } = await createServiceClient()
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    // Scoped to their own investor id, so a crafted keyId cannot revoke
    // somebody else's key.
    .eq("investor_id", investor.id);

  if (error) {
    console.error("[developer] revoke failed:", error);
    return { ok: false };
  }

  revalidatePath("/app/developer");
  return { ok: true };
}
