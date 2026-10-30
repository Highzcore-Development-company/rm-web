import type { ReactNode } from "react";

/**
 * A markdown body, rendered as a small deliberate subset.
 *
 * Headings, paragraphs, bullets, numbered lists, bold, inline code and block
 * quotes. That is what a post or a documentation page is made of, and it is
 * the same set highscore-tech-web's own Markdown component settled on.
 *
 * NO LIBRARY, AND NO dangerouslySetInnerHTML. The text is ours, but it
 * arrives from a database row somebody edits in a form — and never putting
 * raw HTML on the page is the cheapest way for that to stay harmless, today
 * and after whoever wrote this has moved on.
 *
 * Anything unrecognised renders as plain text. A readable failure beats a
 * broken one: an unsupported table shows as its own source rather than
 * taking the page down.
 */
export function PostBody({ markdown }: { markdown: string }) {
  const blocks = markdown.trim().split(/\n{2,}/);

  return (
    <div className="space-y-5">
      {blocks.map((raw, i) => {
        const text = raw.trim();

        if (text.startsWith("### ")) {
          return (
            <h3 key={i} className="pt-2 text-base font-semibold sm:text-lg">
              {inline(text.slice(4))}
            </h3>
          );
        }
        if (text.startsWith("## ")) {
          return (
            <h2
              key={i}
              className="display pt-5 text-xl font-bold tracking-[-0.02em] sm:text-2xl"
            >
              {inline(text.slice(3))}
            </h2>
          );
        }
        if (text.startsWith("> ")) {
          return (
            <blockquote
              key={i}
              className="border-l-2 border-accent/50 pl-4 text-sm italic leading-relaxed text-fg-muted sm:text-base"
            >
              {inline(text.replace(/^> ?/gm, ""))}
            </blockquote>
          );
        }
        // Numbered before bulleted: "1. " would otherwise fall through to a
        // paragraph and lose its numbering.
        if (/^\d+\.\s/m.test(text)) {
          return (
            <ol key={i} className="space-y-2 pl-1">
              {text.split("\n").map((line, j) => (
                <li
                  key={j}
                  className="flex gap-3 text-sm leading-relaxed text-fg-muted sm:text-base"
                >
                  <span className="shrink-0 font-semibold text-accent">
                    {j + 1}.
                  </span>
                  <span>{inline(line.replace(/^\d+\.\s*/, ""))}</span>
                </li>
              ))}
            </ol>
          );
        }
        if (/^[-*]\s/m.test(text)) {
          return (
            <ul key={i} className="space-y-2 pl-1">
              {text.split("\n").map((line, j) => (
                <li
                  key={j}
                  className="flex gap-3 text-sm leading-relaxed text-fg-muted sm:text-base"
                >
                  <span className="shrink-0 text-accent" aria-hidden="true">
                    ·
                  </span>
                  <span>{inline(line.replace(/^[-*]\s*/, ""))}</span>
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p
            key={i}
            className="text-sm leading-relaxed text-fg-muted sm:text-base"
          >
            {inline(text)}
          </p>
        );
      })}
    </div>
  );
}

/** **bold** and `code`, in one pass so they cannot nest wrongly. */
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-fg">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
      return (
        <code
          key={i}
          className="rounded bg-surface px-1.5 py-0.5 font-mono text-[0.9em] text-fg"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
