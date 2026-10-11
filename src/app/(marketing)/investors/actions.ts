"use server";

import { investorEnquiryEmail, isEmailConfigured, sendEmail } from "@/lib/email";

/**
 * The managed-trading enquiry.
 *
 * Deliberately not a signup. Managed clients are closed on a call — they tell
 * us about their business, we talk it through, and we set the account and
 * dashboard up with them. So this form's only job is to start that
 * conversation with enough detail that the first call is useful.
 *
 * It writes nothing to the database. There is no investor record to attach it
 * to yet, and a half-created row for someone who may never sign is worse than
 * an email: it would appear in admin lists, billing queries and counts as if
 * it were a client.
 */

export type EnquiryResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "unconfigured" | "generic" };

/** Long enough to be a real message, short enough not to be a paste bomb. */
const MAX = { name: 120, email: 160, company: 160, phone: 40, message: 4000 } as const;

function clean(value: FormDataEntryValue | null, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Not RFC-complete on purpose — it only has to catch a typo before we reply
 *  to an address that cannot receive. The real test is whether they answer. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export async function submitEnquiry(formData: FormData): Promise<EnquiryResult> {
  // A bot fills every field it can see. A human never sees this one, so
  // anything in it means the submission is automated — dropped silently, and
  // reported as success so the bot has nothing to learn from.
  if (clean(formData.get("website"), 200)) return { ok: true };

  const name = clean(formData.get("name"), MAX.name);
  const email = clean(formData.get("email"), MAX.email);
  const company = clean(formData.get("company"), MAX.company);
  const phone = clean(formData.get("phone"), MAX.phone);
  const message = clean(formData.get("message"), MAX.message);

  if (!name || !looksLikeEmail(email) || !message) return { ok: false, error: "invalid" };

  // Said plainly rather than swallowed. A contact form that silently drops
  // enquiries because SMTP is unset is the most expensive kind of broken —
  // it looks like nobody is interested.
  if (!isEmailConfigured()) {
    console.error("[investors] enquiry received but SMTP is not configured:", email);
    return { ok: false, error: "unconfigured" };
  }

  const to = process.env.EMAIL_ADMIN || process.env.EMAIL_REPLY_TO;
  if (!to) {
    console.error("[investors] no EMAIL_ADMIN or EMAIL_REPLY_TO set");
    return { ok: false, error: "unconfigured" };
  }

  const sent = await sendEmail({
    to,
    ...investorEnquiryEmail({ name, email, company, phone, message }),
  });

  if (!sent.ok) {
    console.error("[investors] enquiry email failed:", sent.error);
    return { ok: false, error: "generic" };
  }

  return { ok: true };
}
