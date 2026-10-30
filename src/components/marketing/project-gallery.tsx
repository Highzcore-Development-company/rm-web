"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";

/**
 * Project media — ported from highscore-tech-web's PortfolioGallery.
 *
 * I HAD BUILT A STACKED LIST OF IMAGES. Esther asked whether I had checked
 * their components; I had taken PremiumCard and the section idiom and
 * stopped, and this is the one that was worth the most. It does four things
 * a plain list does not:
 *
 *   - a VIDEO takes the cover slot, playing muted and looping inline, and
 *     opens full screen WITH sound when clicked
 *   - the cover is big and the rest are a thumbnail grid, so a project with
 *     six screenshots is one screen rather than six
 *   - a LIGHTBOX with arrow keys, Escape, and a counter
 *   - body scroll is locked while it is open, so the page behind does not
 *     slide around under the overlay
 *
 * WHAT CHANGED IN THE PORT. Their `bg-ink` token does not exist here, so the
 * overlay is black/90 on ours; `tabular` is `tabular-nums`; and the
 * thumbnails are `unoptimized` because these files are served from
 * highscore's public bucket and routing them through our optimiser would
 * make our deploy a dependency of their pictures loading.
 *
 * The lightbox image is a plain <img> on purpose, as theirs is: it is
 * displayed at whatever size the viewport allows, which is exactly the case
 * next/image's fixed layouts are bad at.
 */

type Lightbox = { kind: "image"; index: number } | { kind: "video" } | null;

export function ProjectGallery({
  images,
  title,
  videoUrl = null,
}: {
  images: string[];
  title: string;
  videoUrl?: string | null;
}) {
  const [box, setBox] = useState<Lightbox>(null);
  const inlineVideo = useRef<HTMLVideoElement>(null);
  const count = images.length;

  // With a video the cover IS the video, so every image goes to the grid.
  const gridImages = videoUrl ? images : images.slice(1);
  const cover = videoUrl ? null : images[0];

  const close = useCallback(() => setBox(null), []);
  const step = useCallback(
    (d: number) =>
      setBox((b) =>
        b?.kind === "image"
          ? { kind: "image", index: (b.index + d + count) % count }
          : b,
      ),
    [count],
  );

  useEffect(() => {
    if (!box) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (box.kind === "image" && e.key === "ArrowLeft") step(-1);
      else if (box.kind === "image" && e.key === "ArrowRight") step(1);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [box, close, step]);

  if (!videoUrl && count === 0) return null;

  return (
    <>
      {videoUrl ? (
        <button
          type="button"
          onClick={() => setBox({ kind: "video" })}
          aria-label="Play the video full screen, with sound"
          className="group relative block aspect-video w-full overflow-hidden rounded-2xl border border-border bg-black"
        >
          <video
            ref={inlineVideo}
            src={videoUrl}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster={images[0] ?? undefined}
            className="h-full w-full object-cover"
          />
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center transition-colors group-hover:bg-black/20">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-bg/85 px-3 py-1.5 text-xs font-semibold opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              <Maximize2 className="size-3.5" aria-hidden="true" />
              Click for sound and full screen
            </span>
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setBox({ kind: "image", index: 0 })}
          aria-label="View the image full size"
          className="group relative block aspect-video w-full overflow-hidden rounded-2xl border border-border bg-surface"
        >
          <Image
            src={cover as string}
            alt={title}
            fill
            priority
            unoptimized
            sizes="(min-width: 1180px) 1180px, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center transition-colors group-hover:bg-black/25">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-bg/85 px-3 py-1.5 text-xs font-semibold opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              <Maximize2 className="size-3.5" aria-hidden="true" />
              Click to view
            </span>
          </span>
        </button>
      )}

      {gridImages.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4">
          {gridImages.map((src, i) => {
            const index = videoUrl ? i : i + 1;
            return (
              <button
                key={src}
                type="button"
                onClick={() => setBox({ kind: "image", index })}
                aria-label={`View image ${index + 1} full size`}
                className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-surface"
              >
                <Image
                  src={src}
                  alt={`${title} — image ${index + 1}`}
                  fill
                  unoptimized
                  sizes="(min-width: 1180px) 380px, 50vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
              </button>
            );
          })}
        </div>
      ) : null}

      {box ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 backdrop-blur-sm"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-4 top-4 z-10 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X className="size-5" aria-hidden="true" />
          </button>

          {box.kind === "video" ? (
            <video
              src={videoUrl ?? undefined}
              controls
              autoPlay
              playsInline
              onClick={(e) => e.stopPropagation()}
              className="max-h-[90vh] max-w-[94vw] rounded-lg bg-black shadow-2xl"
            />
          ) : (
            <>
              {count > 1 ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    step(-1);
                  }}
                  aria-label="Previous image"
                  className="absolute left-3 inline-flex size-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 md:left-6"
                >
                  <ChevronLeft className="size-6" aria-hidden="true" />
                </button>
              ) : null}

              {/* A plain img, as the original has: this is displayed at
                  whatever size the viewport allows, which is the case
                  next/image's fixed layouts handle worst. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={images[box.index]}
                alt={title}
                onClick={(e) => e.stopPropagation()}
                className="max-h-[88vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
              />

              {count > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      step(1);
                    }}
                    aria-label="Next image"
                    className="absolute right-3 inline-flex size-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 md:right-6"
                  >
                    <ChevronRight className="size-6" aria-hidden="true" />
                  </button>
                  <span className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tabular-nums text-white">
                    {box.index + 1} / {count}
                  </span>
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
