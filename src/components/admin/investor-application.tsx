import type { Investor } from "@/lib/supabase/types";

/**
 * The investor application, for the admin who has to review it.
 *
 * Submitting emails an admin a link to the user page, so the application has
 * to be readable there — otherwise the link goes to a page that does not show
 * the thing it is asking them to review.
 *
 * READ-ONLY, deliberately. The admin's job here is to check it and then link
 * the broker account; editing somebody's declared registration number on
 * their behalf would make the record stop being theirs. Nothing on this panel
 * writes.
 */

type Owner = {
  id: string;
  fullName: string;
  sharePercent: number | null;
  isDirector: boolean;
};

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 border-b border-border/60 py-2 last:border-b-0">
      <dt className="text-xs text-fg-muted">{label}</dt>
      {/* An unanswered field says so rather than rendering an empty space —
          "not given" and "we forgot to ask" look identical otherwise. */}
      <dd className={value ? "text-sm" : "text-sm text-fg-subtle"}>
        {value || "not given"}
      </dd>
    </div>
  );
}

function money(cents: number | null): string | null {
  if (cents == null) return null;
  return `$${(cents / 100).toLocaleString("en-GB")}`;
}

function date(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB");
}

export function InvestorApplication({
  investor,
  owners,
}: {
  investor: Investor;
  owners: Owner[];
}) {
  // A trader has no application, and an investor who has not started one has
  // nothing to show. Both are silence rather than an empty form.
  if (investor.account_type !== "investor") return null;
  if (!investor.company_name && !investor.submitted_at) {
    return (
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Application</h2>
        <p className="mt-2 text-sm text-fg-muted">
          Not started. They signed up as an investor but have not filled
          anything in yet.
        </p>
      </section>
    );
  }

  const submitted = Boolean(investor.submitted_at);

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Application</h2>
        {submitted ? (
          <span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs text-accent">
            Submitted {date(investor.submitted_at)} — awaiting review
          </span>
        ) : (
          // Says plainly that it is unfinished. An admin who reads a partial
          // application as a complete one calls somebody about a form they
          // are still filling in.
          <span className="rounded-full border border-border px-3 py-1 text-xs text-fg-muted">
            In progress — not submitted
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="text-xs uppercase tracking-wide text-fg-muted">
            The company
          </h3>
          <dl className="mt-3">
            <Row label="Registered name" value={investor.company_name} />
            <Row label="Registration number" value={investor.company_reg_number} />
            <Row
              label="Incorporated"
              value={
                [investor.company_state, investor.company_country]
                  .filter(Boolean)
                  .join(", ") || null
              }
            />
            <Row label="Registered address" value={investor.company_address} />
            <Row label="Tax ID" value={investor.company_tax_id} />
            <Row label="Nature of business" value={investor.company_nature} />
            <Row label="Website" value={investor.company_website} />
          </dl>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="text-xs uppercase tracking-wide text-fg-muted">
            Who we deal with
          </h3>
          <dl className="mt-3">
            <Row label="Name" value={investor.contact_name} />
            <Row label="Role" value={investor.contact_role} />
            <Row label="Work email" value={investor.contact_email} />
            <Row label="Phone" value={investor.contact_phone} />
            {/* The one that matters operationally: who can say "stop". */}
            <Row
              label="May give instructions"
              value={
                investor.contact_may_instruct == null
                  ? null
                  : investor.contact_may_instruct
                    ? "Yes"
                    : `No — ${investor.instructing_party ?? "nobody named"}`
              }
            />
          </dl>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="text-xs uppercase tracking-wide text-fg-muted">
            The money
          </h3>
          <dl className="mt-3">
            <Row
              label="Intends to place"
              value={money(investor.intended_amount_usd)}
            />
            <Row label="Source of funds" value={investor.source_of_funds} />
            <Row label="Currency" value={investor.preferred_currency} />
            <Row
              label="Vantage account"
              value={
                investor.wants_account_opened == null
                  ? null
                  : investor.wants_account_opened
                    ? "Wants one opened"
                    : "Has one already"
              }
            />
          </dl>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="text-xs uppercase tracking-wide text-fg-muted">
            Ownership
          </h3>
          {owners.length === 0 ? (
            <p className="mt-3 text-sm text-fg-subtle">Nobody named yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border/60">
              {owners.map((o) => (
                <li key={o.id} className="flex justify-between gap-3 py-2 text-sm">
                  <span>{o.fullName}</span>
                  <span className="text-xs text-fg-muted">
                    {o.isDirector ? "Director" : "Shareholder"}
                    {o.sharePercent != null ? ` · ${o.sharePercent}%` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="mt-6 text-xs uppercase tracking-wide text-fg-muted">
            Agreements
          </h3>
          <dl className="mt-3">
            <Row label="Risk acknowledged" value={date(investor.risk_acknowledged_at)} />
            <Row label="Management agreement" value={date(investor.management_agreement_at)} />
            <Row label="Terms" value={date(investor.terms_accepted_at)} />
          </dl>
        </div>
      </div>

      {/* The documents are not in the product yet — Victor's call, so that
          uploads did not hold the form up. Said here so a reviewer does not
          go looking for a section that was never built. */}
      <p className="mt-4 text-xs leading-relaxed text-fg-muted">
        Certificate of incorporation, a director&apos;s ID and proof of the
        registered address are collected on the call — there are no uploads in
        the form yet.
      </p>
    </section>
  );
}
