// Creates the seed super admin.
//
//   npm run seed:admin
//
// NOT A MIGRATION, AND NOT PRODUCTION-SAFE BY DESIGN.
//
// The spec seeds admin@highzcore.tech with password 123456789. That password
// is now in a chat log and a build spec, and the account it opens can disable
// users and read financials. So:
//
//   - this refuses to run against anything that is not local
//   - the account is created with must_change_password = true, and every admin
//     route is blocked until it is changed
//   - it is a script, run deliberately, not a migration that could re-run in a
//     pipeline and silently reset a password somebody had already changed
//
// For production, create the first super admin by hand in the Supabase
// dashboard with a password nobody has written down.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i).trim(),
        l.slice(i + 1).trim().replace(/^['"]|['"]$/g, ""),
      ];
    }),
);

const siteUrl = env.NEXT_PUBLIC_SITE_URL ?? "";
const isLocal = siteUrl.includes("localhost") || siteUrl.includes("127.0.0.1");

if (!isLocal) {
  console.error(
    "Refusing to run.\n" +
      `  NEXT_PUBLIC_SITE_URL is ${siteUrl || "(unset)"}, which is not local.\n\n` +
      "This creates an account with a password that is written down in a spec.\n" +
      "Create the production super admin by hand, with a password that is not.",
  );
  process.exit(1);
}

const EMAIL = "admin@highzcore.tech";
const PASSWORD = "123456789";

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data: existing } = await supabase.auth.admin.listUsers();
const already = existing.users.find((u) => u.email === EMAIL);

let userId;

if (already) {
  userId = already.id;
  console.log(`${EMAIL} already exists (${userId})`);
  // Deliberately NOT resetting the password. If somebody has already changed
  // it, re-running this must not put the known one back.
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    // Confirmed so the seed admin is not held at the OTP gate. They are still
    // held at the password gate, which is the one that matters here.
    email_confirm: true,
  });

  if (error) {
    console.error("could not create the account:", error.message);
    process.exit(1);
  }

  userId = data.user.id;
  console.log(`created ${EMAIL} (${userId})`);
}

// The bootstrap trigger promotes this address on sign-up, but an account
// created through the admin API does not fire it, so the row is ensured here.
const { error: adminError } = await supabase.from("app_admins").upsert(
  {
    user_id: userId,
    role: "super_admin",
    note: "Seed super admin",
    must_change_password: true,
  },
  { onConflict: "user_id" },
);

if (adminError) {
  console.error("could not grant super admin:", adminError.message);
  process.exit(1);
}

// An investor row too: the app layout creates one for every signed-in user,
// and the admin should not be the exception that discovers a null path.
const { data: investor } = await supabase
  .from("investors")
  .select("id")
  .eq("user_id", userId)
  .maybeSingle();

if (!investor) {
  await supabase.from("investors").insert({ user_id: userId });
}

console.log(
  [
    "",
    "super admin ready",
    `  email    ${EMAIL}`,
    `  password ${PASSWORD}`,
    "",
    "It cannot reach a single admin route until that password is changed.",
    "Signing in lands on /app/admin/change-password and stays there.",
  ].join("\n"),
);
