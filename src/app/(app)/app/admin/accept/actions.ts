"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { inviteTokenMatches } from "@/lib/staff-invite";
import type { AdminInvitation } from "@/lib/supabase/types";

export type AcceptResult = { ok: true } | { ok: false; error: string };

/** The shortest password we will create an account with. */
const MIN_PASSWORD = 8;

/**
 * Accept an invitation by setting a password — for somebody with no account.
 *
 * Victor described the flow as "he will accept and set up his password from
 * the email received", and it did not work that way. A signed-out invitee was
 * redirected to /app/login, which is a dead end for the person this feature is
 * for: a colleague who has never had a Highzcore account. The invite email even
 * said "They do not need a Highzcore account yet", which was true of the
 * invitation and false of what happened when they clicked it.
 *
 * THE TOKEN IS THE AUTHORISATION. It went to one mailbox, it is 256 bits from
 * a CSPRNG, it is stored only as a hash, and it is compared in constant time.
 * Holding it is the proof that the person reading the email is the person it
 * was sent to — which is the same proof the signed-in path relies on, just
 * without requiring them to have acquired an account first.
 *
 * So the account is created WITH THE ADDRESS FROM THE INVITATION, never one
 * supplied by the caller. Taking an email here would turn an invite for a
 * colleague into an account-creation endpoint for any address somebody fancied.
 *
 * Email is marked confirmed: clicking a link that only ever reached that inbox
 * is the confirmation, and sending a second one to prove the first arrived is
 * theatre.
 */
export async function acceptWithPassword(
  token: string,
  password: string,
): Promise<AcceptResult> {
  if (!token) return { ok: false, error: "invalid" };
  if (password.length < MIN_PASSWORD) return { ok: false, error: "weak" };

  const service = createServiceClient();

  // Candidates, then a constant-time match — the same shape as the page, so
  // the comparison lives in one place that is demonstrably constant time.
  const { data: rows } = await service
    .from("admin_invitations")
    .select("*")
    .is("accepted_at", null)
    .is("revoked_at", null);

  const invitation = ((rows ?? []) as AdminInvitation[]).find((row) =>
    inviteTokenMatches(token, row.token_hash),
  );

  if (!invitation) return { ok: false, error: "invalid" };
  if (new Date(invitation.expires_at) < new Date()) {
    return { ok: false, error: "expired" };
  }

  const email = invitation.email.toLowerCase();

  // Somebody already holds this address. They should sign in rather than have
  // a second account made for them — and we must never overwrite a password
  // from a link, which would be an account takeover with extra steps.
  const { data: accounts } = await service.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if ((accounts?.users ?? []).some((u) => u.email?.toLowerCase() === email)) {
    return { ok: false, error: "account_exists" };
  }

  const { data: created, error: createError } =
    await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createError || !created.user) {
    console.error("[admin/accept] could not create account:", createError?.message);
    return { ok: false, error: "create_failed" };
  }

  const now = new Date().toISOString();

  const { error: staffError } = await service.from("app_admins").insert({
    user_id: created.user.id,
    role: invitation.role,
    // Clicking a link sent only to this mailbox IS the proof.
    email_verified_at: now,
    accepted_at: now,
    invited_by: invitation.invited_by,
    created_by: invitation.invited_by,
    // They chose it themselves and we have never seen it. The forced change
    // exists for a password WE set.
    must_change_password: false,
    // The profile the inviter filled in.
    full_name: invitation.full_name,
    job_title: invitation.job_title,
    phone: invitation.phone,
    gender: invitation.gender,
    city: invitation.city,
    state: invitation.state,
    country: invitation.country,
    notes: invitation.notes,
    extra_permissions: invitation.extra_permissions ?? [],
  });

  if (staffError) {
    console.error("[admin/accept] could not create staff row:", staffError.message);
    return { ok: false, error: "create_failed" };
  }

  // Burned only after the staff row exists, so a failure above leaves the
  // invitation usable rather than destroying it.
  await service
    .from("admin_invitations")
    .update({ accepted_at: now, accepted_by: created.user.id })
    .eq("id", invitation.id);

  // Sign them in so they land in the panel rather than on a login form asking
  // for the password they typed ten seconds ago.
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    // The account and the access are real; only the session failed. Say so,
    // because "something went wrong" after a successful signup would have them
    // trying to register again.
    return { ok: false, error: "sign_in_failed" };
  }

  return { ok: true };
}
