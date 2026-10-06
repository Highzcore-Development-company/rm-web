import nodemailer from "nodemailer";

/**
 * P2-310 — outbound mail.
 *
 * Separate from Supabase's auth mail, which uses its own SMTP settings in the
 * dashboard. This is the app's own: renewal reminders, and receipts.
 *
 * Returns a result rather than throwing. A failed reminder must not take down
 * the job that sends the other forty.
 */

export type SendResult = { ok: true } | { ok: false; error: string };

function transport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) return null;

  const port = Number(process.env.SMTP_PORT ?? 587);

  return nodemailer.createTransport({
    host,
    port,
    // 465 is implicit TLS; 587 upgrades with STARTTLS. Getting this backwards
    // is the usual cause of a connection that hangs rather than fails.
    secure: port === 465,
    auth: { user, pass },
  });
}

export function isEmailConfigured(): boolean {
  return transport() !== null;
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}): Promise<SendResult> {
  const mailer = transport();
  if (!mailer) return { ok: false, error: "not_configured" };

  try {
    await mailer.sendMail({
      from: process.env.EMAIL_FROM ?? "Highzcore <noreply@highzcore.tech>",
      replyTo: process.env.EMAIL_REPLY_TO,
      to: input.to,
      subject: input.subject,
      // Both parts, always. A text/plain alternative is what stops a
      // transactional mail scoring as spam, and some clients show it.
      text: input.text,
      html: input.html,
      attachments: input.attachments,
    });
    return { ok: true };
  } catch (err) {
    console.error("[email] send failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "send_failed",
    };
  }
}

/** Plain, black-on-white, no images. A reminder is not a newsletter. */
function layout(body: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f6f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
<table role="presentation" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
<tr><td>
<div style="font-size:18px;font-weight:700;letter-spacing:-0.02em">Highzcore</div>
<div style="height:3px;width:40px;background:#FFB020;margin:10px 0 24px"></div>
${body}
<p style="margin-top:32px;font-size:12px;line-height:1.6;color:#666">
Trading carries risk of loss. Past performance does not predict future results.
Your funds are held by Vantage in your own name; we are granted permission to
trade only, never to withdraw.
</p>
</td></tr></table></body></html>`;
}

export function renewalReminder(input: {
  daysLeft: number;
  expiresAt: Date;
  renewUrl: string;
}) {
  const when = input.expiresAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const lead =
    input.daysLeft === 1
      ? "Your Highzcore subscription expires tomorrow."
      : `Your Highzcore subscription expires in ${input.daysLeft} days.`;

  // Says what actually happens on expiry. "Renew now!" with no consequence
  // stated is noise; people act on knowing the bot stops.
  const consequence =
    "When it expires the bot stops trading your account. Your Vantage account, and the money in it, stay yours either way.";

  return {
    subject:
      input.daysLeft === 1
        ? "Your subscription expires tomorrow"
        : `Your subscription expires in ${input.daysLeft} days`,
    text: `${lead}\n\nIt runs until ${when}. ${consequence}\n\nRenew: ${input.renewUrl}\n`,
    html: layout(
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">${lead}</p>
<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#444">It runs until <strong>${when}</strong>. ${consequence}</p>
<a href="${input.renewUrl}" style="display:inline-block;margin-top:8px;background:#FFB020;color:#0A0A0A;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px">Renew subscription</a>`,
    ),
  };
}

/**
 * Sent when an admin confirms an investor's Vantage link.
 *
 * Not in P2-506's list of four, but the link-account page tells people we will
 * email them once it is active — and a promise made in the UI has to be kept
 * by the code. Without it, someone submits a claim and waits indefinitely with
 * no idea whether anything happened.
 */
export function accountLinkedEmail(input: {
  vantageAccountId: string;
  dashboardUrl: string;
  subscribed: boolean;
  subscribeUrl: string;
}) {
  // What happens next genuinely differs, so the email says which one applies
  // rather than a vague "you are all set".
  const next = input.subscribed
    ? "Nothing else is needed. The bot trades your account from here, and you can follow it in your dashboard."
    : "One step left: start your subscription. The bot does not trade your account until it is active.";

  const cta = input.subscribed
    ? { href: input.dashboardUrl, label: "Open my dashboard" }
    : { href: input.subscribeUrl, label: "Start my subscription" };

  return {
    subject: "Your Vantage account is linked",
    text: `Your Vantage account ${input.vantageAccountId} is now linked to Highzcore.

${next}

${cta.label}: ${cta.href}
`,
    html: layout(
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">Your Vantage account <strong>${input.vantageAccountId}</strong> is now linked.</p>
<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#444">${next}</p>
<a href="${cta.href}" style="display:inline-block;margin-top:8px;background:#FFB020;color:#0A0A0A;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px">${cta.label}</a>`,
    ),
  };
}

/**
 * Sent when a payment is banked. P2-312 says receipts are "emailed and
 * downloadable" — the PDF rides along as an attachment so it is both, rather
 * than a link someone has to be signed in to follow months later when their
 * accountant asks for it.
 */
export function receiptEmail(input: {
  months: number;
  amount: string;
  expiresAt: string;
  dashboardUrl: string;
}) {
  const term = input.months === 1 ? "1 month" : `${input.months} months`;
  const lead = `Thank you — your payment of ${input.amount} has been received.`;
  const detail = `That covers ${term}, running until ${input.expiresAt}. Your receipt is attached.`;

  return {
    subject: "Your Highzcore receipt",
    text: `${lead}

${detail}

Dashboard: ${input.dashboardUrl}
`,
    html: layout(
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">${lead}</p>
<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#444">${detail}</p>
<a href="${input.dashboardUrl}" style="display:inline-block;margin-top:8px;background:#FFB020;color:#0A0A0A;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px">Open my dashboard</a>`,
    ),
  };
}
