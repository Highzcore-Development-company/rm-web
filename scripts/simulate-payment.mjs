// Credits a pending invoice as though the money had arrived.
//
//   npm run simulate:payment              # the most recent awaiting invoice
//   npm run simulate:payment -- <sub-id>  # a specific one
//
// WHY THIS EXISTS. Testing the real path needs testnet tokens for a specific
// contract, which may not be obtainable. Everything after the chain read —
// activation, stacking, the receipt email, the dashboard, entitlement — can be
// proven without them, and those are the parts with the money logic in.
//
// It goes through activate_subscription, the same function the webhook and the
// watcher call. A script that wrote `status = confirmed` directly would prove
// nothing about the path that actually runs.
//
// REFUSES TO RUN AGAINST MAINNET OR PRODUCTION.
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

const tronUrl = env.TRON_API_URL ?? "";
const isTestnet = tronUrl.includes("nile") || tronUrl.includes("shasta");
const siteUrl = env.NEXT_PUBLIC_SITE_URL ?? "";
const isLocal = siteUrl.includes("localhost") || siteUrl.includes("127.0.0.1");

if (!isTestnet || !isLocal) {
  console.error(
    "Refusing to run.\n" +
      `  TRON_API_URL        ${tronUrl || "(unset)"}  ${isTestnet ? "ok" : "<- not a testnet"}\n` +
      `  NEXT_PUBLIC_SITE_URL ${siteUrl || "(unset)"}  ${isLocal ? "ok" : "<- not local"}\n\n` +
      "This marks a subscription paid without money moving. It must never be\n" +
      "possible to do that against the real thing.",
  );
  process.exit(1);
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

let subscriptionId = process.argv[2];

if (!subscriptionId) {
  const { data } = await supabase
    .from("subscriptions")
    .select("id, months, amount_usd, method, created_at")
    .eq("status", "awaiting")
    .order("created_at", { ascending: false })
    .limit(1);

  if (!data?.length) {
    console.error(
      "No invoice is awaiting payment. Start a checkout first, then run this.",
    );
    process.exit(1);
  }

  subscriptionId = data[0].id;
  console.log(
    `using the most recent: ${subscriptionId}  (${data[0].months} month(s), ${data[0].method})`,
  );
}

// A marker, so a simulated payment is identifiable afterwards rather than
// indistinguishable from a real one in the record.
const reference = `SIMULATED-${Date.now()}`;

const { data: expiresAt, error } = await supabase.rpc("activate_subscription", {
  p_subscription_id: subscriptionId,
  p_provider_ref: reference,
});

if (error) {
  console.error("activation failed:", error.message);
  process.exit(1);
}

console.log(`\nactivated. paid up until ${expiresAt}`);
console.log(`provider_ref: ${reference}`);

const { data: invoice } = await supabase
  .from("crypto_invoices")
  .select("id")
  .eq("subscription_id", subscriptionId)
  .maybeSingle();

if (invoice) {
  await supabase
    .from("crypto_invoices")
    .update({
      status: "confirmed",
      seen_tx_hash: reference,
      seen_at: new Date().toISOString(),
    })
    .eq("id", invoice.id);
  console.log("crypto invoice marked confirmed");
}

console.log(
  "\nNow check:" +
    "\n  - the checkout page flips to confirmed within ~8 seconds" +
    "\n  - a receipt arrives (the scheduled path sends it; this script does not)" +
    "\n  - /app/dashboard shows the subscription and a receipt link" +
    "\n  - /app/admin/billing counts it in revenue this month",
);
