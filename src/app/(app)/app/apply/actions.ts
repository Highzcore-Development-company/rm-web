"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database, Investor } from "@/lib/supabase/types";
import { getInvestor } from "@/lib/investors";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site";
import { envOr } from "@/lib/env";

export type ApplyResult = { ok: true } | { ok: false; error: string };

/** The server client, as createClient returns it. */
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * HS-BOT-v4 item 9 — the investor application.
 *
 * SAVING AND SUBMITTING ARE DIFFERENT ACTIONS, and that is the whole shape of
 * this file. Nobody has their registration number and a scan of the
 * certificate of incorporation to hand in one sitting, so every field saves
 * on its own and nothing is validated until they say they are finished.
 * A form that refuses to save because a later box is empty does not get
 * completed, it gets abandoned.
 *
 * SUBMITTING ACTIVATES NOTHING. It sets submitted_at and puts the application
 * in front of an admin. status stays `pending`; the broker account is linked
 * by a human after a call. None of these actions can reach status, linked_at
 * or vantage_account_id — the column grants do not include them, so this is
 * enforced by Postgres rather than by this file remembering.
 */

/** The fields an applicant may write. Mirrors the column grants exactly. */
const WRITABLE = [
  "company_name",
  "company_reg_number",
  "company_country",
  "company_state",
  "company_address",
  "company_tax_id",
  "company_nature",
  "company_website",
  "contact_name",
  "contact_role",
  "contact_email",
  "contact_phone",
  "contact_may_instruct",
  "instructing_party",
  "intended_amount_usd",
  "source_of_funds",
  "preferred_currency",
  "wants_account_opened",
] as const;

type Writable = (typeof WRITABLE)[number];

/**
 * Derived from the schema, not restated.
 *
 * Typing these as `string | number | boolean | null` compiled and would have
 * let a number into a text column and a string into intended_amount_usd. The
 * schema already knows which is which, so it decides.
 */
export type ApplicationPatch = Pick<
  Database["public"]["Tables"]["investors"]["Update"],
  Writable
>;

/**
 * The applicant, or why not.
 *
 * Discriminated on a literal `ok` rather than on the presence of `error`.
 * TypeScript narrows a union by a literal field; narrowing on `error: string`
 * leaves both halves possible, and every caller ends up needing a cast to say
 * what the check already proved.
 */
type Context =
  | { ok: false; error: string }
  | { ok: true; supabase: SupabaseServerClient; investor: Investor };

async function investorForUpdate(): Promise<Context> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "signed_out" };

  const investor = await getInvestor(supabase);
  if (!investor) return { ok: false, error: "no_account" };
  if (investor.account_type !== "investor") {
    return { ok: false, error: "not_investor" };
  }

  // Once an admin has linked the broker account this is a record of what was
  // agreed, not a draft. Editing it would change the terms of a live trading
  // relationship from the outside.
  if (investor.linked_at) return { ok: false, error: "already_linked" };

  return { ok: true, supabase, investor };
}

/**
 * Save part of the application. Never validates.
 *
 * Called as somebody moves through the form, so it has to accept a half-filled
 * company section and an empty everything else.
 */
export async function saveApplication(
  patch: ApplicationPatch,
): Promise<ApplyResult> {
  const ctx = await investorForUpdate();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  // Only the granted columns, whatever the caller sent. A server action is a
  // public endpoint: the allowlist is here rather than trusting the shape of
  // what arrives.
  //
  // Built by picking from the patch rather than assigning into an empty
  // object: assigning column-by-column collapses the union of per-column
  // types to their intersection, which is `null`. Picking keeps each
  // column's own type, so a string still cannot land in the amount field.
  const clean: ApplicationPatch = Object.fromEntries(
    WRITABLE.filter((key) => key in patch).map((key) => [key, patch[key] ?? null]),
  );
  if (Object.keys(clean).length === 0) return { ok: true };

  const { error } = await ctx.supabase
    .from("investors")
    .update(clean)
    .eq("id", ctx.investor.id);

  if (error) {
    console.error("[apply] save failed:", error.message);
    return { ok: false, error: "generic" };
  }

  revalidatePath("/app/apply");
  return { ok: true };
}

/** Add a director or an owner over 25%. */
export async function addOwner(
  fullName: string,
  sharePercent: number | null,
  isDirector: boolean,
): Promise<ApplyResult> {
  const ctx = await investorForUpdate();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  if (fullName.trim().length < 2) return { ok: false, error: "bad_name" };
  if (
    sharePercent !== null &&
    (!Number.isFinite(sharePercent) || sharePercent < 0 || sharePercent > 100)
  ) {
    return { ok: false, error: "bad_share" };
  }

  const { error } = await ctx.supabase.from("investor_owners").insert({
    investor_id: ctx.investor.id,
    full_name: fullName.trim(),
    share_percent: sharePercent,
    is_director: isDirector,
  });

  if (error) {
    console.error("[apply] owner insert failed:", error.message);
    return { ok: false, error: "generic" };
  }

  revalidatePath("/app/apply");
  return { ok: true };
}

export async function removeOwner(id: string): Promise<ApplyResult> {
  const ctx = await investorForUpdate();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  // Scoped to their own company as well as the id: RLS would refuse anyway,
  // but a delete that silently matches nothing is worse than one that fails.
  const { error } = await ctx.supabase
    .from("investor_owners")
    .delete()
    .eq("id", id)
    .eq("investor_id", ctx.investor.id);

  if (error) return { ok: false, error: "generic" };
  revalidatePath("/app/apply");
  return { ok: true };
}

/**
 * Record an agreement.
 *
 * Separate from saveApplication because these are timestamps whose RLS policy
 * permits only null to a value. An agreement that can be un-agreed is not
 * evidence of anything, so there is deliberately no way to clear one here.
 */
export async function acceptAgreement(
  which: "risk" | "management" | "terms",
): Promise<ApplyResult> {
  const ctx = await investorForUpdate();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  // Server time, not the browser's. When somebody agreed to something is not
  // a figure the person agreeing should be able to set.
  //
  // Written out per branch rather than with a computed key: a computed key
  // widens to `{[x: string]: string}` and the schema stops checking which
  // column is being written at all.
  const now = new Date().toISOString();
  const patch =
    which === "risk"
      ? { risk_acknowledged_at: now }
      : which === "management"
        ? { management_agreement_at: now }
        : { terms_accepted_at: now };

  const column =
    which === "risk"
      ? "risk_acknowledged_at"
      : which === "management"
        ? "management_agreement_at"
        : "terms_accepted_at";

  const { error } = await ctx.supabase
    .from("investors")
    .update(patch)
    .eq("id", ctx.investor.id)
    // Only null -> a value, matching the RLS policy. An agreement that can be
    // re-stamped is not a record of when it was given.
    .is(column, null);

  if (error) {
    console.error("[apply] agreement failed:", error.message);
    return { ok: false, error: "generic" };
  }

  revalidatePath("/app/apply");
  return { ok: true };
}

/**
 * What must be answered before an application can be submitted.
 *
 * Website is the one listed field not required: plenty of real businesses do
 * not have one, and refusing the application over it would turn a nice-to-have
 * into a blocker. The certificate is not here either — Victor said not to let
 * uploads hold the rest up, so it is collected on the call.
 */
const REQUIRED: { field: string; label: string }[] = [
  { field: "company_name", label: "Registered company name" },
  { field: "company_reg_number", label: "Registration number" },
  { field: "company_country", label: "Country of incorporation" },
  { field: "company_state", label: "State of incorporation" },
  { field: "company_address", label: "Registered address" },
  { field: "company_tax_id", label: "Tax ID" },
  { field: "company_nature", label: "Nature of business" },
  { field: "contact_name", label: "Contact name" },
  { field: "contact_role", label: "Contact role" },
  { field: "contact_email", label: "Work email" },
  { field: "contact_phone", label: "Phone" },
  { field: "source_of_funds", label: "Source of funds" },
  { field: "preferred_currency", label: "Preferred currency" },
];

/**
 * Submit for review.
 *
 * Validates HERE and nowhere earlier. The browser checks the same things for
 * a quicker message, but this is the one that decides — a server action is a
 * URL, and "the form would not let me" is not a guarantee.
 */
export async function submitApplication(): Promise<
  { ok: true } | { ok: false; error: string; missing?: string[] }
> {
  const ctx = await investorForUpdate();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const row = ctx.investor as unknown as Record<string, unknown>;
  const missing = REQUIRED.filter((r) => {
    const value = row[r.field];
    return value === null || value === undefined || String(value).trim() === "";
  }).map((r) => r.label);

  // Both of these are a real answer either way, so "not chosen" is null and
  // has to be caught separately from an empty string.
  if (row.contact_may_instruct === null || row.contact_may_instruct === undefined) {
    missing.push("Whether the contact may give instructions");
  }
  if (row.contact_may_instruct === false && !row.instructing_party) {
    missing.push("Who may give instructions");
  }
  if (row.wants_account_opened === null || row.wants_account_opened === undefined) {
    missing.push("Whether you have a Vantage account");
  }
  if (!row.intended_amount_usd) missing.push("Amount you intend to place");

  for (const [column, label] of [
    ["risk_acknowledged_at", "Risk acknowledgement"],
    ["management_agreement_at", "Management agreement"],
    ["terms_accepted_at", "Terms"],
  ] as const) {
    if (!row[column]) missing.push(label);
  }

  // At least one owner or director. A company with nobody named behind it is
  // the thing this section exists to prevent.
  const { count } = await ctx.supabase
    .from("investor_owners")
    .select("id", { count: "exact", head: true })
    .eq("investor_id", ctx.investor.id);

  if (!count) missing.push("At least one director or owner");

  if (missing.length) return { ok: false, error: "incomplete", missing };

  const { error } = await ctx.supabase
    .from("investors")
    .update({ submitted_at: new Date().toISOString() })
    .eq("id", ctx.investor.id);

  if (error) {
    console.error("[apply] submit failed:", error.message);
    return { ok: false, error: "generic" };
  }

  // Tell an admin. An application nobody is told about sits until somebody
  // happens to look, which for a business waiting on a call is indefinitely.
  const to = envOr(process.env.EMAIL_ADMIN, "");
  if (isEmailConfigured() && to) {
    try {
      await sendEmail({
        to,
        subject: `Investor application — ${String(row.company_name ?? "unnamed")}`,
        text:
          `${String(row.company_name)} has submitted an investor application.\n\n` +
          `Contact: ${String(row.contact_name)} (${String(row.contact_email)})\n` +
          `Phone: ${String(row.contact_phone)}\n\n` +
          `Review it: ${siteUrl()}/app/admin/users/${ctx.investor.id}\n`,
        html:
          `<p><strong>${String(row.company_name)}</strong> has submitted an investor application.</p>` +
          `<p>Contact: ${String(row.contact_name)} (${String(row.contact_email)})<br>` +
          `Phone: ${String(row.contact_phone)}</p>` +
          `<p><a href="${siteUrl()}/app/admin/users/${ctx.investor.id}">Review it</a></p>`,
      });
    } catch (err) {
      // The application IS submitted. Failing the whole action because an
      // email bounced would lose a completed form over a mail server.
      console.error("[apply] could not notify an admin:", err);
    }
  } else {
    console.error("[apply] no admin email configured; nobody was notified");
  }

  revalidatePath("/app/apply");
  return { ok: true };
}
