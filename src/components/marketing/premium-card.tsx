"use client";

import Link from "next/link";
import { useRef, type CSSProperties, type ReactNode } from "react";

/**
 * The marketing-grade card, ported from highscore-tech-web.
 *
 * Esther, 29 Oct: "check highscore tech web component for the resource there
 * and use it for the others — just don't use its colour, maybe its design."
 *
 * SO THE GEOMETRY AND THE LIGHT ARE THEIRS, THE PALETTE IS OURS. Four things
 * make the original card look the way it does, and none of them is a colour:
 *
 *   - a HAIRLINE GRADIENT BORDER, brighter at the top, so the card reads as
 *     lit from above rather than outlined
 *   - a one-pixel INNER HIGHLIGHT along the top edge, which is what sells
 *     that lighting
 *   - a cursor-tracked SPOTLIGHT, so the surface responds to the pointer
 *   - a bottom-rim GLOW on hover
 *
 * Every one of those is built from OUR `--fg` and `--accent` here, so the
 * card inherits our theme and follows it into light mode — rather than
 * carrying their brand colour across with it. Their tokens are `--c-`
 * prefixed and do not exist in this app, so a copy-paste would have rendered
 * a card with no border and no glow at all.
 *
 * NOT FOR DATA-DENSE SURFACES. The original says the same and it is right:
 * this has far too much visual weight for a table or a dashboard panel. Those
 * keep the plain bordered card.
 */
export function PremiumCard({
  children,
  className = "",
  href,
  spotlight = true,
}: {
  children: ReactNode;
  className?: string;
  /** When set, the whole card is a link. */
  href?: string;
  spotlight?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!spotlight) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${((e.clientX - rect.left) / rect.width) * 100}%`);
    el.style.setProperty("--my", `${((e.clientY - rect.top) / rect.height) * 100}%`);
  };

  const body = (
    <div
      ref={ref}
      onMouseMove={onMove}
      className={`group relative isolate overflow-hidden rounded-2xl p-px transition-transform duration-300 hover:-translate-y-0.5 ${className}`}
      style={
        {
          // The hairline, brighter at the top. color-mix against our own fg
          // token rather than a fixed rgba, so it holds in both themes.
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--fg) 16%, transparent) 0%, color-mix(in srgb, var(--fg) 6%, transparent) 50%, color-mix(in srgb, var(--fg) 2%, transparent) 100%)",
        } as CSSProperties
      }
    >
      <div className="relative h-full rounded-[15px] bg-surface/85 backdrop-blur-sm before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-fg/20 before:to-transparent before:opacity-60">
        {spotlight ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[15px] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            style={{
              background:
                "radial-gradient(500px circle at var(--mx, 50%) var(--my, 50%), color-mix(in srgb, var(--accent) 12%, transparent), transparent 60%)",
            }}
          />
        ) : null}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-6 bottom-0 h-px opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            background:
              "linear-gradient(to right, transparent, var(--accent), transparent)",
            boxShadow: "0 0 20px 2px color-mix(in srgb, var(--accent) 50%, transparent)",
          }}
        />

        <div className="relative z-10">{children}</div>
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}
