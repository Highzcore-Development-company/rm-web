"use client";

import { useState } from "react";
import Image from "next/image";
import { Play } from "lucide-react";
import { PremiumCard } from "@/components/marketing/premium-card";
import type { StudioWork } from "@/lib/studio";

/**
 * The studio's work, as a grid of players.
 *
 * NOTHING EMBEDS UNTIL IT IS CLICKED. Nine YouTube iframes on one page is
 * nine third-party players, their scripts and their cookies, loaded for a
 * visitor who will watch at most one. So each card is a poster frame and a
 * play button until somebody asks for it, and only then does the iframe
 * appear — with autoplay, because they have already said they want it.
 *
 * The poster comes from YouTube's own thumbnail, which is already in the
 * data, so this costs one image rather than a player.
 *
 * `youtube-nocookie` for the same reason: a visitor who presses play has
 * chosen to watch, not to be tracked across the web afterwards.
 */
export function StudioReel({ works }: { works: StudioWork[] }) {
  const [playing, setPlaying] = useState<string | null>(null);

  if (works.length === 0) {
    return <p className="text-sm text-fg-muted">Nothing published yet.</p>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 md:gap-6">
      {works.map((work) => {
        const live = playing === work.id;
        return (
          <PremiumCard key={work.id} spotlight={!live} className="h-full">
            <article className="flex h-full flex-col">
              <div className="relative aspect-video w-full overflow-hidden rounded-t-[15px] bg-black">
                {live && work.youtubeId ? (
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${work.youtubeId}?autoplay=1&rel=0`}
                    title={work.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 size-full"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => work.youtubeId && setPlaying(work.id)}
                    // A piece with no playable id is not a dead button: it
                    // opens the original rather than pretending to play.
                    disabled={!work.youtubeId}
                    aria-label={`Play ${work.title}`}
                    className="group absolute inset-0 size-full"
                  >
                    {work.posterUrl ? (
                      <Image
                        src={work.posterUrl}
                        alt=""
                        fill
                        unoptimized
                        sizes="(max-width: 768px) 100vw, 50vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                      />
                    ) : null}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/35">
                      <span className="inline-flex size-14 items-center justify-center rounded-full bg-accent text-[#0A0A0A] shadow-lg transition-transform group-hover:scale-105">
                        <Play
                          className="size-6 translate-x-0.5"
                          fill="currentColor"
                          aria-hidden="true"
                        />
                      </span>
                    </span>
                  </button>
                )}
              </div>

              <div className="flex flex-1 flex-col p-5 md:p-6">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-fg-subtle">
                  {work.projectType ? (
                    <span className="rounded border border-border px-1.5 py-0.5">
                      {work.projectType}
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-3 text-base font-semibold md:text-lg">
                  {work.title}
                </h3>
                {work.client ? (
                  <p className="mt-0.5 text-xs text-accent">{work.client}</p>
                ) : null}
                {work.summary ? (
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                    {work.summary}
                  </p>
                ) : null}

                {!work.youtubeId && work.videoUrl ? (
                  <a
                    href={work.videoUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-3 text-xs text-accent underline underline-offset-2"
                  >
                    Watch it
                  </a>
                ) : null}
              </div>
            </article>
          </PremiumCard>
        );
      })}
    </div>
  );
}
