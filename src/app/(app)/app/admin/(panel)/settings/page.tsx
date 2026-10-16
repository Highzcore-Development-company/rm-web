import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { getAdmin } from "@/lib/admin";
import { ThemeToggle } from "@/components/theme-toggle";
import { createRmServerClient } from "@/lib/supabase/rm-server";
import {
  hasBotSession,
  hasServiceAccess,
  isBotReachable,
} from "@/lib/supabase/rm-server-session";
import { isAlatPayConfigured } from "@/lib/alatpay";
import { envOr } from "@/lib/env";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Settings, and what is actually switched on.
 *
 * THE HEALTH ROWS ARE THE POINT. Every one of these has caught somebody out:
 * a bot feed that was not configured so the desk looked idle, payments pointing
 * at a testnet so money appeared to move and did not, an admin who could see
 * the bot controls but had never signed in to rm-server so every write was
 * silently refused. They belong on a page an admin can reach, not in an env
 * file nobody opens.
 *
 * The controls that change the BOT are not duplicated here — they live on Bot
 * controls, one screen, behind bot.configure. Two places to flip a kill switch
 * is one place too many.
 */
export default async function AdminSettingsPage() {
  const admin = await getAdmin();
  if (!admin) notFound();

  const canSeeBot = admin.permissions.includes("bot.view");
  const canSeeFinance = admin.permissions.includes("finance.view");

  const feedConfigured = createRmServerClient() !== null;
  const writeReady =
    canSeeBot && (hasServiceAccess() || (await hasBotSession()));
  const cryptoTestnet = envOr(process.env.TRON_API_URL, "").includes("nile");

  return (
    <div className="max-w-3xl">
      {/* NO VISIBLE PAGE TITLE. Victor, 16 Oct: "remove all title from each
          pages, I don't like it... Keep it without any title." The sidebar
          already says which page this is, so the heading and its blurb were
          repeating it back.

          The h1 stays, screen-reader-only: a document with no h1 gives an
          assistive reader no landmark to jump to and no idea what it has
          landed on, and "invisible" is not the same as "absent". */}
      <h1 className="sr-only">Settings</h1>

      <section>
        <h2 className="text-sm font-medium">Appearance</h2>
        <div className="surface mt-3 flex items-center justify-between gap-4 rounded-xl border border-border p-5">
          <div>
            <p className="text-sm">Theme</p>
            <p className="mt-1 text-xs text-fg-muted">
              Stored in this browser. It is not part of your admin account.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium">System</h2>
        <p className="mt-1 text-xs leading-relaxed text-fg-muted">
          Read from the environment on every load. A red row is a deployment
          problem, not a setting you can change here.
        </p>

        <div className="mt-3 space-y-2">
          {canSeeBot ? (
            <>
              <Health
                label="Bot feed (rm-server)"
                ok={feedConfigured}
                detail={
                  feedConfigured
                    ? "Configured. The desk, chart and figures read from it."
                    : "Not configured — RM_SERVER_SUPABASE_URL and RM_SERVER_SUPABASE_ANON_KEY are unset, so every bot figure reads as unavailable."
                }
              />
              <Health
                label="Bot writes"
                ok={writeReady}
                detail={
                  !isBotReachable()
                    ? "rm-server is unreachable, so no setting can be written to the bot."
                    : writeReady
                      ? "Ready. Market settings and the trading switch can be written."
                      : "You can read the bot but not write to it — connect on Bot controls first. Until then every write is refused."
                }
              />
            </>
          ) : null}

          {canSeeFinance ? (
            <Health
              label="Payments"
              ok={isAlatPayConfigured() && !cryptoTestnet}
              detail={
                !isAlatPayConfigured()
                  ? "AlatPay is not configured. Card and transfer payments cannot be taken."
                  : cryptoTestnet
                    ? "AlatPay is live but TRON points at the Nile TESTNET — USDT payments are not real money."
                    : "AlatPay and TRON mainnet are both configured."
              }
            />
          ) : null}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium">Elsewhere</h2>
        <div className="mt-3 space-y-2">
          <Jump href="/app/admin/profile" label="My profile">
            Your role, permissions and sign-in history.
          </Jump>
          <Jump href="/app/admin/change-password" label="Change password">
            Yours only. Nobody can change another admin&rsquo;s.
          </Jump>
          {admin.permissions.includes("bot.configure") ? (
            <Jump href="/app/admin/bot" label="Bot controls">
              The global trading switch, approval mode and the rm-server
              connection.
            </Jump>
          ) : null}
          {admin.permissions.includes("admins.manage") ? (
            <Jump href="/app/admin/admins" label="Admins">
              Invite colleagues and set what each role may do.
            </Jump>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Health({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <div
      className={`surface flex items-start gap-3 rounded-lg border px-4 py-3 ${
        ok ? "border-border" : "border-accent/40"
      }`}
    >
      <span
        aria-hidden="true"
        className={`mt-1.5 size-2 shrink-0 rounded-full ${
          ok ? "bg-chart-up" : "bg-accent"
        }`}
      />
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{detail}</p>
      </div>
    </div>
  );
}

function Jump({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="surface group flex items-start justify-between gap-4 rounded-lg border border-border px-4 py-3 transition-colors hover:border-accent/40"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{children}</p>
      </div>
      <ArrowUpRight
        className="mt-0.5 size-4 shrink-0 text-fg-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}
