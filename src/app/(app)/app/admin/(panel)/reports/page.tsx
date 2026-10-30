import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { DayReport, type DayItem } from "@/components/admin/day-report";
import { TeamDays, type TeamDay } from "@/components/admin/team-days";

export const metadata: Metadata = { title: "My day", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * HS-WEB-v1 — start of day and end of day.
 *
 * Esther, 29 Oct: "SOD is a staff way of describing what you will work on for
 * the day, and EOD is what you achieved out of what you worked on, even if
 * it's all."
 *
 * TWO AUDIENCES ON ONE PAGE, and the order is deliberate: your own day first,
 * the team's below it and only if you were granted it. Everybody files; the
 * manager's view is the addition, not the other way round.
 *
 * NO PERMISSION GUARDS THE PAGE ITSELF. Every staff member has a day, so
 * gating the whole section would mean granting people the right to do their
 * own admin — which is not a decision anybody should have to make per person.
 * `reports.view_all` gates the TEAM half, and the database says the same.
 */
/**
 * Today, and a fortnight ago, as calendar dates.
 *
 * READ ONCE AND AWAITED, out of the render body. Two clock reads a few
 * milliseconds apart can land on different days at midnight, and "today"
 * would then mean two things on one page — the lint rule objecting to a clock
 * inside a component is pointing at a real bug, not a style preference. The
 * page is `force-dynamic`, so this is a fresh clock per request.
 */
async function calendar(): Promise<{ today: string; since: string }> {
  const now = Date.now();
  return {
    today: new Date(now).toISOString().slice(0, 10),
    since: new Date(now - 14 * 86_400_000).toISOString().slice(0, 10),
  };
}

export default async function ReportsPage() {
  const admin = await getAdmin();
  // Staff only. The panel layout has already established this, but a page
  // that reads somebody's reports should not rely on a parent for it.
  if (!admin) notFound();

  const supabase = await createClient();

  const { today, since } = await calendar();

  const { data: dayRow } = await supabase
    .from("staff_days")
    .select("id, note, sod_at, eod_at")
    .eq("user_id", admin.userId)
    .eq("day", today)
    .maybeSingle();

  let items: DayItem[] = [];
  if (dayRow?.id) {
    const { data } = await supabase
      .from("staff_day_items")
      .select("id, plan, done, outcome")
      .eq("day_id", dayRow.id as string)
      .order("position", { ascending: true });

    items = (data ?? []).map((i) => ({
      id: i.id as string,
      plan: i.plan as string,
      done: i.done as boolean | null,
      outcome: i.outcome as string | null,
    }));
  }

  const canSeeTeam = admin.permissions.includes("reports.view_all");

  /**
   * The team's last fortnight.
   *
   * Read with the SAME client, so RLS decides rather than this page. If the
   * permission is withheld the policy returns nothing and the section does
   * not render — the gate holds in the database, which is what HS-WEB-v1
   * asks for ("a hidden section is not a permission").
   */
  let team: TeamDay[] = [];
  if (canSeeTeam) {
    const { data } = await supabase
      .from("staff_days")
      .select("id, user_id, day, note, sod_at, eod_at, staff_day_items(plan, done, outcome)")
      .gte("day", since)
      .order("day", { ascending: false });

    const names = new Map<string, string>();
    const { data: people } = await supabase
      .from("app_admins")
      .select("user_id, full_name");
    for (const p of people ?? []) {
      if (p.full_name) names.set(p.user_id as string, p.full_name as string);
    }

    team = (data ?? []).map((d) => {
      const rows = (d.staff_day_items ?? []) as {
        plan: string;
        done: boolean | null;
      }[];
      return {
        id: d.id as string,
        who: names.get(d.user_id as string) ?? "A colleague",
        isMe: (d.user_id as string) === admin.userId,
        day: d.day as string,
        note: d.note as string | null,
        filed: Boolean(d.sod_at),
        closed: Boolean(d.eod_at),
        planned: rows.length,
        achieved: rows.filter((r) => r.done === true).length,
        items: rows.map((r) => ({ plan: r.plan, done: r.done })),
      };
    });
  }

  return (
    <div className="max-w-3xl">
      <h1 className="sr-only">My day</h1>

      <section>
        <h2 className="text-xs uppercase tracking-wide text-fg-muted">Today</h2>
        <p className="mt-2 max-w-prose text-xs leading-relaxed text-fg-muted">
          Write what you are working on. At the end of the day, answer the same
          list — that is the end-of-day report, and ticking everything is a
          normal day, not a boast.
        </p>
        <div className="mt-4">
          <DayReport
            items={items}
            note={(dayRow?.note as string | null) ?? null}
            filed={Boolean(dayRow?.sod_at)}
            closed={Boolean(dayRow?.eod_at)}
          />
        </div>
      </section>

      {canSeeTeam ? (
        <section className="mt-10">
          <h2 className="text-xs uppercase tracking-wide text-fg-muted">
            The team
          </h2>
          <p className="mt-2 max-w-prose text-xs leading-relaxed text-fg-muted">
            The last two weeks. A day with no plan filed is shown as that
            rather than hidden — not filing is the thing worth seeing.
          </p>
          <div className="mt-4">
            <TeamDays days={team} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
