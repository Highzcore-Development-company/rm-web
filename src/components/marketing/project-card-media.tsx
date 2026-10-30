"use client";

import { useRef, useState } from "react";
import Image from "next/image";

/**
 * The portfolio grid thumbnail — ported from highscore-tech-web's
 * PortfolioCardMedia.
 *
 * Esther: use their UI and UX, only not their colour. So the behaviour is
 * theirs exactly: the cover sits still, and if the project has a video,
 * hovering fades a muted looping clip in over it and plays — a silent
 * preview. Pointer leaves, it pauses and rewinds. The category rides in the
 * corner.
 *
 * The one substitution is the no-cover fallback. Theirs paints a cyan-tinted
 * graphite gradient from `--c-graphite-800/900`, which are their tokens and
 * their brand colour; this uses our surface and accent so a project without
 * a picture still looks like it belongs to this site.
 *
 * `unoptimized` because these files live in highscore's public bucket —
 * routing them through our optimiser would make our deploy a dependency of
 * their pictures loading.
 */
export function ProjectCardMedia({
  cover,
  video = null,
  category,
  title,
}: {
  cover: string | null;
  video?: string | null;
  category: string | null;
  title: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const onEnter = () => {
    const v = videoRef.current;
    if (!v) return;
    setPlaying(true);
    // A rejected play() is an autoplay policy, not a bug — fall back to the
    // still rather than leaving a frozen first frame on screen.
    v.play().catch(() => setPlaying(false));
  };

  const onLeave = () => {
    const v = videoRef.current;
    setPlaying(false);
    if (v) {
      v.pause();
      v.currentTime = 0;
    }
  };

  return (
    <div
      className="relative aspect-[16/10] w-full overflow-hidden rounded-t-[15px] bg-surface"
      onMouseEnter={video ? onEnter : undefined}
      onMouseLeave={video ? onLeave : undefined}
    >
      {cover ? (
        <Image
          src={cover}
          alt=""
          fill
          unoptimized
          sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(80% 50% at 50% 30%, color-mix(in srgb, var(--accent) 16%, transparent) 0%, transparent 70%), linear-gradient(135deg, var(--surface), var(--bg))",
          }}
        />
      )}

      {video ? (
        <video
          ref={videoRef}
          src={video}
          muted
          loop
          playsInline
          preload="metadata"
          className={`absolute inset-0 size-full object-cover transition-opacity duration-300 ${
            playing ? "opacity-100" : "opacity-0"
          }`}
        />
      ) : null}

      {category ? (
        <span className="absolute left-3 top-3 rounded-full border border-border bg-bg/80 px-2 py-0.5 text-[11px] font-medium text-fg-muted backdrop-blur">
          {category}
        </span>
      ) : null}

      <span className="sr-only">{title}</span>
    </div>
  );
}
