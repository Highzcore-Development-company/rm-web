/**
 * Skeletons for the admin pages while their data loads.
 *
 * Every admin page is a server component that awaits a database round trip —
 * several of them awaiting rm-server, which is a different project and a
 * slower hop. Without a loading file Next holds the OLD page on screen while
 * the next one fetches, so clicking a nav item appears to do nothing for a
 * second or two and people click it again.
 *
 * A skeleton is not decoration here: it is the acknowledgement that the click
 * landed. It mirrors the SHAPE of what is coming, so the page does not jump
 * when the real thing arrives.
 *
 * aria-hidden throughout, with one live region naming what is loading — a
 * screen reader should hear "Loading users", not forty empty boxes.
 */

function Bar({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded bg-fg/10 ${className}`}
    />
  );
}

/** Wraps any skeleton so assistive tech is told once what is happening. */
export function SkeletonPage({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span role="status" aria-live="polite" className="sr-only">
        {label}
      </span>
      {children}
    </div>
  );
}

/** Page heading plus its one-line description. */
export function SkeletonHeading() {
  return (
    <div className="mb-8">
      <Bar className="h-8 w-48" />
      <Bar className="mt-3 h-4 w-full max-w-md" />
    </div>
  );
}

/** A row of stat cards. */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border border-border bg-surface p-5">
          <Bar className="h-3 w-24" />
          <Bar className="mt-3 h-8 w-20" />
        </div>
      ))}
    </dl>
  );
}

/**
 * A table.
 *
 * Deliberately a fixed number of rows rather than a guess at the real count:
 * guessing high makes a short list jump upwards when it arrives, and the point
 * is for the layout to settle, not to be accurate about something unknowable.
 */
export function SkeletonTable({
  rows = 6,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex gap-4 border-b border-border px-4 py-3">
        {Array.from({ length: cols }, (_, i) => (
          <Bar key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={r}
          className="flex gap-4 border-b border-border px-4 py-3.5 last:border-b-0"
        >
          {Array.from({ length: cols }, (_, c) => (
            <Bar
              key={c}
              // The first column is a name or a date and reads longer; the
              // rest are numbers. Equal bars look like a loading spinner
              // pretending to be a table.
              className={`h-4 ${c === 0 ? "flex-[2]" : "flex-1"}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
