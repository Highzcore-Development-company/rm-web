import nodemailer from "nodemailer";
import { envNumberOr, envOr } from "@/lib/env";

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

  const port = envNumberOr(process.env.SMTP_PORT, 587);

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
      from: envOr(process.env.EMAIL_FROM, "Highzcore <noreply@highzcore.tech>"),
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

/**
 * Black-on-white, one image, inline styles only.
 *
 * The logo is the LIGHT-background variant and an absolute URL, because an
 * email is read on somebody else's client: a relative path has nothing to
 * resolve against, and the dark-mode wordmark would be invisible on the white
 * card. PNG rather than the SVG the site uses — Gmail and Outlook do not
 * render SVG at all.
 *
 * The wordmark is also the alt text, so the email still identifies itself in
 * the many clients that block images by default.
 */
function layout(body: string): string {
  const site = envOr(process.env.NEXT_PUBLIC_SITE_URL, "https://highzcore.com");

  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f6f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
<table role="presentation" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
<tr><td>
<img src="${site}/logo-light.png" alt="Highzcore" width="150" style="display:block;width:150px;max-width:150px;height:auto;border:0" />
<div style="height:3px;width:40px;background:#FFB020;margin:14px 0 24px"></div>
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

/**
 * The verification code. Sent by us, over our SMTP — Supabase sends nothing.
 *
 * The code is large and monospaced because it is read off one device and typed
 * into another, and the expiry is stated so nobody wonders why an old email
 * stopped working.
 */
export function verificationCodeEmail(input: {
  code: string;
  minutes: number;
}) {
  const lead = "Here is your Highzcore verification code.";
  const note = `It expires in ${input.minutes} minutes. If you did not ask for this, you can ignore this email — nothing has been created in your name.`;

  return {
    subject: `${input.code} is your Highzcore code`,
    text: `${lead}

${input.code}

${note}
`,
    html: layout(
      `<p style="margin:0 0 20px;font-size:16px;line-height:1.5">${lead}</p>
<div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:34px;font-weight:700;letter-spacing:10px;background:#f6f6f6;border-radius:10px;padding:18px 20px;text-align:center">${input.code}</div>
<p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#666">${note}</p>`,
    ),
  };
}

/**
 * P2-506 — the bot opened a position.
 *
 * Deliberately does NOT carry a lot size, a balance or a cash P&L. The
 * investor's own size is whatever the MAM allocated them, so any figure we
 * printed would be the MASTER's and wrong for the reader. Direction, market
 * and price are true for everyone copied; a number is not.
 */
export function tradeOpenedEmail(input: {
  symbol: string;
  side: string;
  openedAt: Date;
  dashboardUrl: string;
}) {
  const side = input.side.toLowerCase() === "sell" ? "Sell" : "Buy";
  const when = input.openedAt.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const lead = `The bot opened a ${side.toLowerCase()} on ${input.symbol}.`;

  return {
    subject: `${side} ${input.symbol} opened`,
    text: `${lead}\n\nOpened ${when}. Your own position size is whatever Vantage allocated to your account.\n\nSee it: ${input.dashboardUrl}\n`,
    html: layout(
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">${lead}</p>
<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#444">Opened ${when}. Your own position size is whatever Vantage allocated to your account.</p>
<a href="${input.dashboardUrl}" style="display:inline-block;margin-top:8px;background:#FFB020;color:#0A0A0A;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px">Open dashboard</a>`,
    ),
  };
}

/**
 * P2-506 — the bot closed a position.
 *
 * The result is a PERCENTAGE move on the instrument, never a cash figure, for
 * the same reason as above: the cash is the master's. The sign is written into
 * the number and the word, not carried by colour — a red figure and a green
 * one are the same figure to a deuteranopic reader, and this is the email that
 * tells somebody whether they made money.
 */
export function tradeClosedEmail(input: {
  symbol: string;
  side: string;
  movePercent: number | null;
  closedAt: Date;
  dashboardUrl: string;
}) {
  const side = input.side.toLowerCase() === "sell" ? "sell" : "buy";
  const when = input.closedAt.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const move =
    input.movePercent === null
      ? null
      : `${input.movePercent >= 0 ? "+" : "−"}${Math.abs(input.movePercent).toFixed(2)}%`;

  const outcome =
    input.movePercent === null
      ? "closed"
      : input.movePercent >= 0
        ? `closed up ${move}`
        : `closed down ${move}`;

  const lead = `The ${side} on ${input.symbol} ${outcome}.`;

  return {
    subject: `${input.symbol} closed${move ? ` ${move}` : ""}`,
    text: `${lead}\n\nClosed ${when}. That is the move on the instrument, not your cash result — your own figure depends on the size Vantage allocated you.\n\nSee it: ${input.dashboardUrl}\n`,
    html: layout(
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">${lead}</p>
<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#444">Closed ${when}. That is the move on the instrument, not your cash result — your own figure depends on the size Vantage allocated you.</p>
<a href="${input.dashboardUrl}" style="display:inline-block;margin-top:8px;background:#FFB020;color:#0A0A0A;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px">Open dashboard</a>`,
    ),
  };
}

/**
 * P2-506 — trading has been switched off.
 *
 * The one notification in the list that is NOT about money, and the one people
 * most need: silence from a trading bot is ambiguous. Without this, "no emails
 * today" means either a quiet market or a stopped bot, and the investor cannot
 * tell which.
 *
 * No reason is given because we do not reliably have one, and inventing a
 * reassuring one would be worse than saying nothing.
 */
export function botSwitchedOffEmail(input: {
  stoppedAt: Date;
  dashboardUrl: string;
}) {
  const when = input.stoppedAt.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const lead = "Trading has been switched off.";

  return {
    subject: "Trading has been switched off",
    text: `${lead}\n\nAs of ${when} the bot is not opening new positions on any account, including yours. Anything already open is unaffected. Your Vantage account and the money in it stay yours throughout.\n\nDashboard: ${input.dashboardUrl}\n`,
    html: layout(
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">${lead}</p>
<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#444">As of <strong>${when}</strong> the bot is not opening new positions on any account, including yours. Anything already open is unaffected. Your Vantage account and the money in it stay yours throughout.</p>
<a href="${input.dashboardUrl}" style="display:inline-block;margin-top:8px;background:#FFB020;color:#0A0A0A;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px">Open dashboard</a>`,
    ),
  };
}
