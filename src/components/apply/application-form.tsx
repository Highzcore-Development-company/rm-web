"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Loader2, Trash2 } from "lucide-react";
import {
  acceptAgreement,
  addOwner,
  removeOwner,
  saveApplication,
  submitApplication,
  type ApplicationPatch,
} from "@/app/(app)/app/apply/actions";
import type { Investor } from "@/lib/supabase/types";

/**
 * HS-BOT-v4 item 9 — the investor application form.
 *
 * SAVES PER SECTION, not per keystroke and not only at the end. Per keystroke
 * is a write to the database for every letter typed; only at the end loses
 * everything to a closed tab. A section is the unit somebody actually
 * finishes, so it is the unit that gets saved.
 *
 * NOTHING IS VALIDATED UNTIL SUBMIT. A form that refuses to save because a
 * later box is empty does not get completed, it gets abandoned — and these
 * are people who have to go and find a registration number.
 */

type Owner = {
  id: string;
  fullName: string;
  sharePercent: number | null;
  isDirector: boolean;
};

/** Every text field, so a section can be read back without naming each one. */
type Fields = Record<string, string>;

function initialFields(i: Investor): Fields {
  const str = (v: unknown) => (v == null ? "" : String(v));
  return {
    company_name: str(i.company_name),
    company_reg_number: str(i.company_reg_number),
    company_country: str(i.company_country),
    company_state: str(i.company_state),
    company_address: str(i.company_address),
    company_tax_id: str(i.company_tax_id),
    company_nature: str(i.company_nature),
    company_website: str(i.company_website),
    contact_name: str(i.contact_name),
    contact_role: str(i.contact_role),
    contact_email: str(i.contact_email),
    contact_phone: str(i.contact_phone),
    instructing_party: str(i.instructing_party),
    source_of_funds: str(i.source_of_funds),
    preferred_currency: str(i.preferred_currency ?? "USD"),
    // Shown in whole dollars; stored in cents, like every amount here.
    intended_amount:
      i.intended_amount_usd == null ? "" : String(i.intended_amount_usd / 100),
  };
}

function Field({
  id,
  label,
  value,
  onChange,
  hint,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  type?: string;
}) {
  return (
    <label htmlFor={id} className="block text-sm">
      {label}
      {hint ? (
        <span className="mt-0.5 block text-xs text-fg-muted">{hint}</span>
      ) : null}
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field-input mt-1.5 w-full rounded-lg px-3 py-2.5 text-sm"
      />
    </label>
  );
}

function Section({
  title,
  intro,
  children,
  onSave,
  saving,
  saved,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {intro ? (
        <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{intro}</p>
      ) : null}

      <div className="mt-5 space-y-4">{children}</div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:border-accent disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save this section"}
        </button>
        {/* Confirmed rather than assumed. A form that saves silently is one
            people re-type into because they cannot tell whether it worked. */}
        {saved && !saving ? (
          <span className="flex items-center gap-1 text-xs text-chart-up">
            <Check className="size-3.5" aria-hidden="true" />
            Saved
          </span>
        ) : null}
      </div>
    </section>
  );
}

export function ApplicationForm({
  investor,
  owners: initialOwners,
}: {
  investor: Investor;
  owners: Owner[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [fields, setFields] = useState<Fields>(() => initialFields(investor));
  const [mayInstruct, setMayInstruct] = useState<boolean | null>(
    investor.contact_may_instruct,
  );
  const [hasAccount, setHasAccount] = useState<boolean | null>(
    investor.wants_account_opened == null
      ? null
      : !investor.wants_account_opened,
  );
  const [owners, setOwners] = useState<Owner[]>(initialOwners);
  const [ownerName, setOwnerName] = useState("");
  const [ownerShare, setOwnerShare] = useState("");
  const [ownerDirector, setOwnerDirector] = useState(true);

  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const submitted = Boolean(investor.submitted_at);
  const set = (key: string) => (v: string) =>
    setFields((f) => ({ ...f, [key]: v }));

  function save(section: string, patch: ApplicationPatch) {
    setSavingSection(section);
    setError(null);
    start(async () => {
      const res = await saveApplication(patch);
      setSavingSection(null);
      if (res.ok) {
        setSavedSection(section);
        router.refresh();
      } else setError(res.error);
    });
  }

  // Already in. Nothing here is editable, because an application under review
  // that changes underneath the reviewer is worse than one they have to ask
  // about.
  if (submitted) {
    return (
      <div className="rounded-xl border border-chart-up/40 bg-chart-up/5 p-6">
        <h2 className="text-lg font-semibold">Application received</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">
          Submitted on{" "}
          {new Date(investor.submitted_at as string).toLocaleDateString("en-GB")}.
          We will review it and call you to set the account up. Nothing is
          active yet and you have not been charged.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          We will also ask for your certificate of incorporation, a
          director&apos;s ID and proof of the registered address on that call.
        </p>
      </div>
    );
  }

  const agreements = [
    {
      key: "risk" as const,
      at: investor.risk_acknowledged_at,
      label: "Risk acknowledgement",
      body:
        "Trading carries risk of loss. Past performance does not predict " +
        "future results. The bot can lose money.",
    },
    {
      key: "management" as const,
      at: investor.management_agreement_at,
      label: "Management agreement",
      body:
        "You grant permission to trade the account, and only to trade — " +
        "never to withdraw. You can end it at any time.",
    },
    {
      key: "terms" as const,
      at: investor.terms_accepted_at,
      label: "Terms",
      body: "The platform terms and privacy policy.",
    },
  ];

  return (
    <div className="space-y-6">
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-chart-down/50 bg-chart-down/10 px-4 py-3 text-sm"
        >
          Could not save. {error === "already_linked"
            ? "This account is already set up."
            : "Try again, or tell us if it keeps happening."}
        </p>
      ) : null}

      <Section
        title="The company"
        intro="The business that will hold the trading account."
        onSave={() =>
          save("company", {
            company_name: fields.company_name || null,
            company_reg_number: fields.company_reg_number || null,
            company_country: fields.company_country || null,
            company_state: fields.company_state || null,
            company_address: fields.company_address || null,
            company_tax_id: fields.company_tax_id || null,
            company_nature: fields.company_nature || null,
            company_website: fields.company_website || null,
          })
        }
        saving={savingSection === "company"}
        saved={savedSection === "company"}
      >
        <Field id="company_name" label="Registered name" value={fields.company_name} onChange={set("company_name")} />
        <Field
          id="company_reg_number"
          label="Registration number (RC)"
          hint="The only thing that uniquely identifies a company — two businesses can share a trading name."
          value={fields.company_reg_number}
          onChange={set("company_reg_number")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="company_country" label="Country of incorporation" value={fields.company_country} onChange={set("company_country")} />
          <Field id="company_state" label="State of incorporation" value={fields.company_state} onChange={set("company_state")} />
        </div>
        <Field id="company_address" label="Registered address" value={fields.company_address} onChange={set("company_address")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="company_tax_id" label="Tax ID" value={fields.company_tax_id} onChange={set("company_tax_id")} />
          <Field id="company_nature" label="Nature of business" value={fields.company_nature} onChange={set("company_nature")} />
        </div>
        <Field id="company_website" label="Website" hint="Optional." value={fields.company_website} onChange={set("company_website")} />
      </Section>

      <Section
        title="Who we deal with"
        intro="Somebody has to be able to say “stop trading” and be believed."
        onSave={() =>
          save("contact", {
            contact_name: fields.contact_name || null,
            contact_role: fields.contact_role || null,
            contact_email: fields.contact_email || null,
            contact_phone: fields.contact_phone || null,
            contact_may_instruct: mayInstruct,
            instructing_party: mayInstruct === false ? fields.instructing_party || null : null,
          })
        }
        saving={savingSection === "contact"}
        saved={savedSection === "contact"}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="contact_name" label="Full name" value={fields.contact_name} onChange={set("contact_name")} />
          <Field id="contact_role" label="Role" value={fields.contact_role} onChange={set("contact_role")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="contact_email" label="Work email" type="email" value={fields.contact_email} onChange={set("contact_email")} />
          <Field id="contact_phone" label="Phone" type="tel" value={fields.contact_phone} onChange={set("contact_phone")} />
        </div>

        <fieldset>
          <legend className="text-sm">Can this person give trading instructions?</legend>
          <div className="mt-2 flex gap-4 text-sm">
            {[
              { v: true, label: "Yes" },
              { v: false, label: "No — somebody else does" },
            ].map((o) => (
              <label key={String(o.v)} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="may_instruct"
                  checked={mayInstruct === o.v}
                  onChange={() => setMayInstruct(o.v)}
                  className="control"
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>

        {mayInstruct === false ? (
          <Field
            id="instructing_party"
            label="Who may give instructions"
            value={fields.instructing_party}
            onChange={set("instructing_party")}
          />
        ) : null}
      </Section>

      <Section
        title="Ownership"
        intro="Directors, and anyone holding more than 25%."
        onSave={() => {
          setSavedSection("owners");
        }}
        saving={false}
        saved={savedSection === "owners"}
      >
        {owners.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {owners.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span>
                  {o.fullName}
                  <span className="ml-2 text-xs text-fg-muted">
                    {o.isDirector ? "Director" : "Shareholder"}
                    {o.sharePercent != null ? ` · ${o.sharePercent}%` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${o.fullName}`}
                  onClick={() =>
                    start(async () => {
                      const res = await removeOwner(o.id);
                      if (res.ok) {
                        setOwners((list) => list.filter((x) => x.id !== o.id));
                        router.refresh();
                      }
                    })
                  }
                  className="text-fg-muted transition-colors hover:text-chart-down"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">Nobody added yet.</p>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 basis-48 text-sm">
            Name
            <input
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              className="field-input mt-1.5 w-full rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="basis-28 text-sm">
            Share %
            <input
              inputMode="decimal"
              value={ownerShare}
              onChange={(e) => setOwnerShare(e.target.value)}
              className="field-input mt-1.5 w-full rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={ownerDirector}
              onChange={(e) => setOwnerDirector(e.target.checked)}
              className="control"
            />
            Director
          </label>
          <button
            type="button"
            disabled={pending || ownerName.trim().length < 2}
            onClick={() =>
              start(async () => {
                const share = ownerShare.trim() === "" ? null : Number(ownerShare);
                const res = await addOwner(ownerName, share, ownerDirector);
                if (res.ok) {
                  setOwnerName("");
                  setOwnerShare("");
                  router.refresh();
                } else setError(res.error);
              })
            }
            className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:border-accent disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </Section>

      <Section
        title="The money"
        onSave={() =>
          save("money", {
            // Whole dollars in, cents out. Money is integer minor units
            // everywhere behind this form.
            intended_amount_usd: fields.intended_amount
              ? Math.round(Number(fields.intended_amount) * 100)
              : null,
            source_of_funds: fields.source_of_funds || null,
            preferred_currency: fields.preferred_currency || null,
            wants_account_opened: hasAccount == null ? null : !hasAccount,
          })
        }
        saving={savingSection === "money"}
        saved={savedSection === "money"}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="intended_amount"
            label="Amount you intend to place (USD)"
            value={fields.intended_amount}
            onChange={set("intended_amount")}
          />
          <Field
            id="preferred_currency"
            label="Preferred currency"
            value={fields.preferred_currency}
            onChange={set("preferred_currency")}
          />
        </div>
        <Field
          id="source_of_funds"
          label="Source of funds"
          hint="Where the money comes from — trading capital, retained profit, an investment fund."
          value={fields.source_of_funds}
          onChange={set("source_of_funds")}
        />

        <fieldset>
          <legend className="text-sm">Do you already have a Vantage account?</legend>
          <div className="mt-2 flex gap-4 text-sm">
            {[
              { v: true, label: "Yes" },
              { v: false, label: "No — please open one" },
            ].map((o) => (
              <label key={String(o.v)} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="has_account"
                  checked={hasAccount === o.v}
                  onChange={() => setHasAccount(o.v)}
                  className="control"
                />
                {o.label}
              </label>
            ))}
          </div>
          {hasAccount === true ? (
            <p className="mt-2 text-xs text-fg-muted">
              {/* The number is linked by an admin after the call, not typed
                  here — nobody self-links an account into live trading. */}
              We will take the account number on the call and link it for you.
            </p>
          ) : null}
        </fieldset>
      </Section>

      <Section
        title="Agreements"
        intro="Each of these is recorded with the date you agreed, and cannot be undone here."
        onSave={() => setSavedSection("agreements")}
        saving={false}
        saved={savedSection === "agreements"}
      >
        {agreements.map((a) => (
          <div
            key={a.key}
            className="rounded-lg border border-border p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{a.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-fg-muted">
                  {a.body}
                </p>
              </div>
              {a.at ? (
                <span className="flex shrink-0 items-center gap-1 text-xs text-chart-up">
                  <Check className="size-3.5" aria-hidden="true" />
                  {new Date(a.at).toLocaleDateString("en-GB")}
                </span>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await acceptAgreement(a.key);
                      if (res.ok) router.refresh();
                      else setError(res.error);
                    })
                  }
                  className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs transition-colors hover:border-accent disabled:opacity-50"
                >
                  I agree
                </button>
              )}
            </div>
          </div>
        ))}
      </Section>

      {missing.length > 0 ? (
        <div
          role="alert"
          className="rounded-xl border border-accent/40 bg-accent/5 p-5"
        >
          <p className="text-sm font-medium">Still needed before we can review it</p>
          <ul className="mt-2 list-inside list-disc space-y-0.5 text-sm text-fg-muted">
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="text-sm leading-relaxed text-fg-muted">
          Submitting sends this for review. It does not start trading and does
          not charge you — we will call you to set the account up.
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setMissing([]);
              setError(null);
              const res = await submitApplication();
              if (res.ok) router.refresh();
              else if (res.error === "incomplete") setMissing(res.missing ?? []);
              else setError(res.error);
            })
          }
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          Submit application
        </button>
      </div>
    </div>
  );
}
