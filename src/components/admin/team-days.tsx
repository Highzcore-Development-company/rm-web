export type TeamDay = {
  id: string;
  who: string;
  isMe: boolean;
  day: string;
  note: string | null;
  filed: boolean;
  closed: boolean;
  planned: number;
  achieved: number;
  items: { plan: string; done: boolean | null }[];
};

/**
 * Everybody's day, for whoever was granted reports.view_all.
 *
 * READ ONLY, deliberately. A manager reads the team's reports; they do not
 * write somebody else's day, and the RLS policy says the same from the other
 * side — reports.view_all grants SELECT and nothing more.
 *
 * GROUPED BY DAY, NOT BY PERSON. The question this answers is "what happened
 * on Tuesday", which is a question about a day; grouping by person turns it
 * into five lists somebody has to read in parallel to get the same answer.
 *
 * A day that was never filed is SHOWN, not skipped. Nobody filing is the
 * thing most worth seeing, and an absence rendered as nothing is an absence
 * nobody notices.
 */
export function TeamDays({ days }: { days: TeamDay[] }) {
  if (days.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-surface px-4 py-6 text-center text-sm text-fg-muted">
        Nobody has filed a day in the last fortnight.
      </p>
    );
  }

  // Grouped here rather than in SQL: the set is one fortnight of staff days,
  // so it is tens of rows, and a GROUP BY would cost a second query to get
  // the items back.
  const byDay = new Map<string, TeamDay[]>();
  for (const d of days) {
    const list = byDay.get(d.day) ?? [];
    list.push(d);
    byDay.set(d.day, list);
  }

  return (
    <div className="space-y-5">
      {[...byDay.entries()].map(([day, rows]) => (
        <section key={day}>
          <h3 className="text-xs font-medium text-fg-muted">{prettyDay(day)}</h3>

          <ul className="mt-2 space-y-2">
            {rows.map((d) => (
              <li
                key={d.id}
                className="rounded-xl border border-border bg-surface p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">
                    {d.who}
                    {d.isMe ? (
                      <span className="ml-2 text-xs font-normal text-fg-subtle">
                        you
                      </span>
                    ) : null}
                  </p>
                  <Status day={d} />
                </div>

                {d.items.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {d.items.map((item, i) => (
                      <li
                        key={`${d.id}-${i}`}
                        className="flex items-start gap-2 text-xs"
                      >
                        {/* The mark says the answer; the word beside it says
                            the same thing, because colour alone is not a
                            report somebody can read. */}
                        <span
                          className={
                            item.done === true
                              ? "text-chart-up"
                              : item.done === false
                                ? "text-chart-down"
                                : "text-fg-subtle"
                          }
                          aria-hidden="true"
                        >
                          {item.done === true ? "✓" : item.done === false ? "–" : "·"}
                        </span>
                        <span
                          className={
                            item.done === false ? "text-fg-muted" : "text-fg"
                          }
                        >
                          {item.plan}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-fg-subtle">
                    Nothing written down.
                  </p>
                )}

                {d.note ? (
                  <p className="mt-2 border-l-2 border-border pl-3 text-xs leading-relaxed text-fg-muted">
                    {d.note}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * Where the day got to.
 *
 * Three states, and the middle one is the point: a plan filed and never
 * answered is not the same as a day closed off, and showing both as "filed"
 * would hide the half that matters.
 */
function Status({ day }: { day: TeamDay }) {
  if (day.closed) {
    return (
      <span className="text-xs text-fg-muted">
        {day.achieved} of {day.planned} done
      </span>
    );
  }
  if (day.filed) {
    return (
      <span className="text-xs text-accent">
        Planned {day.planned}, not closed off
      </span>
    );
  }
  return <span className="text-xs text-fg-subtle">No plan filed</span>;
}

/** "Today", "Yesterday", or the date. */
function prettyDay(iso: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (iso === today) return "Today";
  if (iso === yesterday) return "Yesterday";
  // Parsed as UTC noon so a timezone cannot shift the label onto the day
  // before — the column is a calendar date, not an instant.
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}
