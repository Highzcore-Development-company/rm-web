"use server";

import { createClient } from "@/lib/supabase/server";
import { getInvestor } from "@/lib/investors";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { envOr } from "@/lib/env";

export type EnquiryResult = { ok: true } | { ok: false; error: string };

/**
 * Tell us how to reach you about managed trading.
 *
 * Deliberately does NOT create, link or activate anything, and writes nothing
 * to the database at all. It sends the team an email. An enquiry is not an
 * account — the account is set up on a call — and anything more here would be
 * the self-serve investor flow the brief rules out.
 */
export async function submitEnquiry(
  phone: string,
  note: string,
): Promise<EnquiryResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "signed_out" };

  const investor = await getInvestor(supabase);
  if (investor?.account_type === "trader") {
    return { ok: false, error: "not_investor" };
  }

  if (phone.trim().length < 7) return { ok: false, error: "bad_phone" };

  const to = envOr(process.env.EMAIL_ADMIN, "");
  if (!isEmailConfigured() || !to) {
    // Nothing was stored, so there is no other copy of this. Reporting
    // success would leave somebody waiting for a call nobody was told to
    // make — the worst possible failure for this particular form.
    console.error("[enquiry] no admin email configured; nobody was notified");
    return { ok: false, error: "not_configured" };
  }

  const body = `New managed-trading enquiry.

Email: ${auth.user.email}
Phone: ${phone.trim()}

${note.trim() || "(no message)"}
`;

  try {
    await sendEmail({
      to,
      subject: `Managed trading enquiry — ${auth.user.email}`,
      text: body,
      html: `<pre style="font:14px/1.6 monospace">${body
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")}</pre>`,
    });
  } catch (err) {
    console.error("[enquiry] could not send:", err);
    return { ok: false, error: "not_configured" };
  }

  return { ok: true };
}
