import { Container } from "@/components/ui";

/**
 * P2-105 — terms and privacy.
 *
 * The structure and the clauses the brief requires are here. The wording is a
 * draft and is marked as one: this is D2, Victor's legal review, and shipping
 * invented legal copy on a product that touches other people's money is not a
 * thing to do quietly. Remove the notice when a lawyer has signed it off.
 */
export function LegalPage({
  title,
  draftNotice,
  sections,
}: {
  title: string;
  draftNotice: string;
  sections: { key: string; title: string; body: string }[];
}) {
  return (
    <Container className="py-16 sm:py-24">
      <div className="max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {title}
        </h1>

        <p
          role="note"
          className="mt-6 rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm"
        >
          {draftNotice}
        </p>

        <div className="mt-12 space-y-10">
          {sections.map((section) => (
            <section key={section.key}>
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-fg-muted">
                {section.body}
              </p>
            </section>
          ))}
        </div>
      </div>
    </Container>
  );
}
