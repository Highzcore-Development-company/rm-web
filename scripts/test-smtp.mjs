// Checks the SMTP credentials and, with an argument, sends a real test email.
//
//   npm run test:smtp
//   npm run test:smtp -- you@example.com
//
// Exists because "we could not send the email" is the right message for an
// investor and useless for whoever has to fix it. This prints what the mail
// server actually said.
import { readFileSync } from "node:fs";
import nodemailer from "nodemailer";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i).trim(),
        l
          .slice(i + 1)
          .trim()
          .replace(/^['"]|['"]$/g, ""),
      ];
    }),
);

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM } = env;

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
  console.error("Missing SMTP_HOST, SMTP_USER or SMTP_PASSWORD in .env.local");
  process.exit(1);
}

console.log(`host ${SMTP_HOST}  port ${SMTP_PORT}  user ${SMTP_USER}`);
console.log(`from ${EMAIL_FROM}\n`);

const port = Number(SMTP_PORT ?? 587);
const transport = nodemailer.createTransport({
  host: SMTP_HOST,
  port,
  // 465 is implicit TLS, 587 upgrades with STARTTLS. Mismatching these hangs
  // rather than failing, which is why it is derived rather than configured.
  secure: port === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  connectionTimeout: 15000,
});

try {
  await transport.verify();
  console.log("login OK");
} catch (err) {
  console.error(
    `login FAILED: ${err.responseCode ?? err.code ?? ""} ${err.response ?? err.message}`,
  );

  // 535 is the server saying the credentials are wrong. A port or TLS problem
  // fails as ECONNREFUSED or ETIMEDOUT instead, so the distinction is worth
  // drawing rather than making someone guess.
  if (err.responseCode === 535) {
    console.error(
      [
        "",
        "535 means the mailbox rejected the username or password.",
        "  - SMTP_USER must be the FULL email address of a real mailbox",
        "  - SMTP_PASSWORD is that mailbox's own password, set in the mail host",
        "  - most hosts also require EMAIL_FROM to be that same address",
      ].join("\n"),
    );
  }
  process.exit(1);
}

const to = process.argv[2];
if (!to) {
  console.log(
    "\nPass an address to send a real one: npm run test:smtp -- you@example.com",
  );
  process.exit(0);
}

const info = await transport.sendMail({
  from: EMAIL_FROM ?? SMTP_USER,
  to,
  subject: "Highzcore SMTP test",
  text: "If you are reading this, outbound email works.",
});
console.log(`sent: ${info.messageId}`);
