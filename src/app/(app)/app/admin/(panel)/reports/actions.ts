"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdmin } from "@/lib/admin";

export type ReportResult = { ok: true } | { ok: false; error: string };

/**
 * HS-WEB-v1 — the start-of-day plan and the end-of-day result.
 *
 * Esther, 29 Oct: "SOD is a staff way of describing what you will work on for
 * the day, and EOD is what you achieved out of what you worked on, even if
 * it's all."
 *
 * SO EOD IS ANSWERED AGAINST THE MORNING'S LIST, not written fresh. Every
 * action here works on items that already exist; there is deliberately no way
 * to "file an EOD" without having filed a plan, because the comparison is the
 * whole point and a day with only an EOD cannot be compared to anything.
 *
 * NOBODY WRITES SOMEBODY ELSE'S DAY. Every statement is scoped to the signed
 * in user's own row, and the RLS policy says the same thing from the other
 * side. reports.view_all grants READING the team, never writing it.
 */

/** The signed-in staff member, or why not. */
async function me() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false as const, error: "signed_out" };

  // Staff, not customers. An investor has no day to file, and the section is
  // not in their navigation — this is the lock rather than the courtesy.
  const admin = await getAdmin();
  if (!admin) return { ok: false as const, error: "forbidden" };

  return { ok: true as const, supabase, userId: auth.user.id };
}

/**
 * Today, as a calendar date, in the format the column wants.
 *
 * The SERVER's day, deliberately. Two people in different timezones filing
 * "today" must land on the same row as each other, and on the same row as the
 * manager reading it — otherwise a Lagos evening and a London evening are
 * different Tuesdays.
 */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Open today's row if it is not open already.
 *
 * Returns the row id. Separate from filing the plan because every other
 * action needs the row to exist and none of them should have to care whether
 * it is the first write of the day.
 */
async function dayRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const day = today();

  const { data: existing } = await supabase
    .from("staff_days")
    .select("id")
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data, error } = await supabase
    .from("staff_days")
    .insert({ user_id: userId, day })
    .select("id")
    .maybeSingle();

  if (error) {
    // The unique constraint firing means somebody opened the day in another
    // tab a moment ago. That is not a failure — read theirs and carry on.
    const { data: raced } = await supabase
      .from("staff_days")
      .select("id")
      .eq("user_id", userId)
      .eq("day", day)
      .maybeSingle();
    return (raced?.id as string) ?? null;
  }

  return (data?.id as string) ?? null;
}

/** Add one thing to today's plan. */
export async function addPlanItem(plan: string): Promise<ReportResult> {
  const ctx = await me();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const text = plan.trim();
  if (text.length < 2) return { ok: false, error: "too_short" };
  if (text.length > 500) return { ok: false, error: "too_long" };

  const dayId = await dayRow(ctx.supabase, ctx.userId);
  if (!dayId) return { ok: false, error: "generic" };

  // Appended, not prepended: a plan reads in the order it was written, and
  // the evening is read against the morning line by line.
  const { count } = await ctx.supabase
    .from("staff_day_items")
    .select("id", { count: "exact", head: true })
    .eq("day_id", dayId);

  const { error } = await ctx.supabase.from("staff_day_items").insert({
    day_id: dayId,
    plan: text,
    position: count ?? 0,
  });

  if (error) {
    console.error("[reports] could not add a plan item:", error.message);
    return { ok: false, error: "generic" };
  }

  // Filing the first item IS filing the plan. Asking somebody to type their
  // day and then press a separate "submit the plan" button is a step that
  // only exists to be forgotten.
  await ctx.supabase
    .from("staff_days")
    .update({ sod_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", dayId)
    .is("sod_at", null);

  revalidatePath("/app/admin/reports");
  return { ok: true };
}

export async function removePlanItem(id: string): Promise<ReportResult> {
  const ctx = await me();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  // Scoped by the policy as well, but said here too: a delete that silently
  // matches nothing is worse than one that fails.
  const { error } = await ctx.supabase
    .from("staff_day_items")
    .delete()
    .eq("id", id);

  if (error) return { ok: false, error: "generic" };
  revalidatePath("/app/admin/reports");
  return { ok: true };
}

/**
 * Answer one item at the end of the day.
 *
 * `done` is boolean | null — null puts it back to unanswered. "Not done" and
 * "not answered yet" are different reports and must stay tellable apart.
 */
export async function answerItem(
  id: string,
  done: boolean | null,
  outcome?: string,
): Promise<ReportResult> {
  const ctx = await me();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const { error } = await ctx.supabase
    .from("staff_day_items")
    .update({ done, outcome: outcome?.trim() || null })
    .eq("id", id);

  if (error) {
    console.error("[reports] could not answer an item:", error.message);
    return { ok: false, error: "generic" };
  }

  revalidatePath("/app/admin/reports");
  return { ok: true };
}

/** A note about the day as a whole — blocked on someone, half a day off. */
export async function saveNote(note: string): Promise<ReportResult> {
  const ctx = await me();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const dayId = await dayRow(ctx.supabase, ctx.userId);
  if (!dayId) return { ok: false, error: "generic" };

  const { error } = await ctx.supabase
    .from("staff_days")
    .update({ note: note.trim() || null, updated_at: new Date().toISOString() })
    .eq("id", dayId);

  if (error) return { ok: false, error: "generic" };
  revalidatePath("/app/admin/reports");
  return { ok: true };
}

/**
 * Close the day off.
 *
 * REFUSES WHILE ANYTHING IS UNANSWERED, and that is the one piece of
 * friction worth keeping. "What you achieved out of what you worked on" is
 * not answerable if three items were never ticked either way — the report
 * would look finished and say nothing. Not done is a perfectly good answer;
 * no answer is not.
 */
export async function closeDay(): Promise<
  { ok: true } | { ok: false; error: string; unanswered?: number }
> {
  const ctx = await me();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const dayId = await dayRow(ctx.supabase, ctx.userId);
  if (!dayId) return { ok: false, error: "generic" };

  const { count: total } = await ctx.supabase
    .from("staff_day_items")
    .select("id", { count: "exact", head: true })
    .eq("day_id", dayId);

  if (!total) return { ok: false, error: "no_plan" };

  const { count: open } = await ctx.supabase
    .from("staff_day_items")
    .select("id", { count: "exact", head: true })
    .eq("day_id", dayId)
    .is("done", null);

  if (open) return { ok: false, error: "unanswered", unanswered: open };

  const { error } = await ctx.supabase
    .from("staff_days")
    .update({ eod_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", dayId);

  if (error) return { ok: false, error: "generic" };
  revalidatePath("/app/admin/reports");
  return { ok: true };
}

/** Reopen a day that was closed too early. */
export async function reopenDay(): Promise<ReportResult> {
  const ctx = await me();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const dayId = await dayRow(ctx.supabase, ctx.userId);
  if (!dayId) return { ok: false, error: "generic" };

  // Only TODAY's can be reopened — dayRow only ever returns today. Yesterday
  // is a record, and a record somebody can quietly rewrite is not one.
  const { error } = await ctx.supabase
    .from("staff_days")
    .update({ eod_at: null, updated_at: new Date().toISOString() })
    .eq("id", dayId);

  if (error) return { ok: false, error: "generic" };
  revalidatePath("/app/admin/reports");
  return { ok: true };
}
