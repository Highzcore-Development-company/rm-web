import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { inviteTokenMatches } from "@/lib/staff-invite";
import { SetPasswordForm } from "@/components/admin/set-password-form";
import type { AdminInvitation } from "@/lib/supabase/types";

export const metadata: Metadata = {
  title: "Accept invitation",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

/**
 * Accept a staff invitation.
 *
 * OUTSIDE the (panel) route group on purpose: that layout 404s anyone who is
 * not already an admin, and the whole point of this page is that the visitor
 * is not one yet.
 *
 * Accepting is what proves the address. The link only ever went to the invited
 * mailbox, so clicking it while signed in as that address is the verification
 * — which is why email_verified_at is written here and nowhere else for staff.
 *
 * Every refusal is a distinct message. "That did not work" on a page somebody
 * reached from an email they were expecting is how an invitation gets
 * abandoned and re-sent three times.
 */
/** Hoisted out of the page: a component defined during render is a new type
 *  on every pass, which remounts the subtree it owns. */
function Message({
  title,
  body,
  back,
}: {
  title: string;
  body: string;
  back: string;
}) {
  return (
    <Container className="py-20">
      <div className="mx-auto max-w-lg">
        <h1 className="display text-2xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">{body}</p>
        <Link
          href="/app/dashboard"
          className="mt-6 inline-block text-sm text-accent hover:underline"
        >
          {back}
        </Link>
      </div>
    </Container>
  );
}

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const t = await getTranslations("staffInvite");
  const { token } = await searchParams;

  if (!token) return <Message title={t("invalid")} body={t("invalidBody")} back={t("toDashboard")} />;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const service = createServiceClient();

  // Candidates, then a constant-time match. Looking the token up by its hash
  // would be one query, but this keeps the comparison in one place that is
  // demonstrably constant time.
  const { data: rows } = await service
    .from("admin_invitations")
    .select("*")
    .is("accepted_at", null)
    .is("revoked_at", null);

  const invitation = ((rows ?? []) as AdminInvitation[]).find((row) =>
    inviteTokenMatches(token, row.token_hash),
  );

  if (!invitation) return <Message title={t("invalid")} body={t("invalidBody")} back={t("toDashboard")} />;

  if (new Date(invitation.expires_at) < new Date()) {
    return (
      <Message
        title={t("expired")}
        body={t("expiredBody")}
        back={t("toDashboard")}
      />
    );
  }

  /**
   * SIGNED OUT, AND NO ACCOUNT YET: let them set a password here.
   *
   * This is the case the feature exists for — a colleague who has never had a
   * Highzcore account — and it used to redirect to /app/login, which is a dead
   * end for them. The invite email said "they do not need a Highzcore account
   * yet", which was true of the invitation and false the moment they clicked
   * it.
   *
   * Whoever already has an account is still sent to sign in: we must never
   * set a password over an existing one from a link, which would be an account
   * takeover with extra steps.
   */
  if (!auth.user) {
    const { data: accounts } = await service.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const exists = (accounts?.users ?? []).some(
      (u) => u.email?.toLowerCase() === invitation.email.toLowerCase(),
    );

    if (exists) {
      redirect(
        `/app/login?next=${encodeURIComponent(
          `/app/admin/accept?token=${token}`,
        )}`,
      );
    }

    const { data: roleRow } = await service
      .from("admin_roles")
      .select("label")
      .eq("name", invitation.role)
      .maybeSingle();

    return (
      <Container className="py-20">
        <div className="mx-auto max-w-lg">
          {/* A plain string: next-intl's `t` has no default-value option, and
              `staffInvite` has no `title` key — asking for one would log a
              missing-message error on the page a new colleague sees first. */}
          <h1 className="display text-2xl font-semibold">
            You have been invited
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-fg-muted">
            Choose a password and you are in. We never see it — only you will
            know it.
          </p>
          <SetPasswordForm
            token={token}
            email={invitation.email}
            name={invitation.full_name}
            roleLabel={(roleRow?.label as string) ?? invitation.role}
          />
        </div>
      </Container>
    );
  }

  // The invitation is for one address. Accepting it while signed in as someone
  // else would hand the role to the wrong person — the likely case being a
  // shared computer, not an attack.
  if (auth.user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
    return (
      <Message
        title={t("wrongAccount")}
        body={t("wrongAccountBody", { email: invitation.email })}
        back={t("toDashboard")}
      />
    );
  }

  const now = new Date().toISOString();

  const { error } = await service.from("app_admins").insert({
    user_id: auth.user.id,
    role: invitation.role,
    // THE PROFILE COMES FROM THE INVITATION. The person who sent it knew the
    // colleague's name and city; the colleague arriving here should not be
    // asked to type their own details back at us, and would not be able to
    // set their own permissions anyway.
    full_name: invitation.full_name,
    job_title: invitation.job_title,
    phone: invitation.phone,
    gender: invitation.gender,
    city: invitation.city,
    state: invitation.state,
    country: invitation.country,
    notes: invitation.notes,
    extra_permissions: invitation.extra_permissions ?? [],
    // Clicking a link sent only to this mailbox IS the proof.
    email_verified_at: now,
    accepted_at: now,
    invited_by: invitation.invited_by,
    created_by: invitation.invited_by,
    // They signed in with their own password, which we have never seen. The
    // forced change exists for a password WE set.
    must_change_password: false,
  });

  if (error) {
    console.error("[admin/accept] could not create staff row:", error.message);
    return (
      <Message
        title={t("failed")}
        body={t("failedBody")}
        back={t("toDashboard")}
      />
    );
  }

  // Marked used only after the row exists, so a failure above leaves the
  // invitation usable rather than burning it.
  await service
    .from("admin_invitations")
    .update({ accepted_at: now, accepted_by: auth.user.id })
    .eq("id", invitation.id);

  redirect("/app/admin");
}
