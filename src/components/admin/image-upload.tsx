"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Pick a picture, or paste a link to one.
 *
 * Esther: "Cover image URL — why URL? What if I want to upload the picture?"
 * Quite. A URL field asks somebody maintaining a portfolio to go and host an
 * image somewhere else first, which is not a job they should have.
 *
 * BOTH, NOT ONE. Upload is the normal path now. The URL box stays because
 * the ten projects already here point at highscore's bucket, and taking the
 * field away would mean re-uploading every one of their images to change a
 * title.
 *
 * UPLOADED FROM THE BROWSER, NOT THROUGH A SERVER ACTION. A server action
 * would mean the file crossing our server to reach storage — twice the
 * transfer, and Next's action body limit sits well under a 10MB photo.
 * Supabase storage takes the upload directly with the signed-in user's
 * session, and the bucket policy decides: writes need portfolio.manage,
 * reads need nothing.
 *
 * THE PATH IS NAMESPACED AND RANDOM. `<folder>/<uuid>.<ext>` so two projects
 * cannot collide on "cover.jpg", and so a filename somebody typed never
 * becomes a public URL.
 */
export function ImageUpload({
  label,
  value,
  onChange,
  folder,
  hint,
  multiple = false,
}: {
  label: string;
  /** One URL, or newline-separated URLs when multiple. */
  value: string;
  onChange: (value: string) => void;
  /** Keeps one project's files together in the bucket. */
  folder: string;
  hint?: string;
  multiple?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const urls = value.split("\n").map((u) => u.trim()).filter(Boolean);

  async function upload(files: FileList) {
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const added: string[] = [];

    for (const file of Array.from(files)) {
      // Namespaced and random — see the note above.
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${folder || "misc"}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("portfolio")
        .upload(path, file, { cacheControl: "31536000", upsert: false });

      if (upErr) {
        // Named, not swallowed. The two that actually happen are "too big"
        // and "not allowed", and both are worth saying plainly.
        setError(
          /exceeded|too large/i.test(upErr.message)
            ? `${file.name} is over 10MB.`
            : /mime|allowed/i.test(upErr.message)
              ? `${file.name} is not an image we accept.`
              : `${file.name} did not upload. ${upErr.message}`,
        );
        break;
      }

      const { data } = supabase.storage.from("portfolio").getPublicUrl(path);
      added.push(data.publicUrl);
    }

    if (added.length) {
      onChange(multiple ? [...urls, ...added].join("\n") : added[0]);
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  function removeAt(i: number) {
    // Removed from the PROJECT, left in the bucket. Deleting the object here
    // would break any case study still pointing at it, and an orphaned image
    // costs a few kilobytes — which is the cheaper mistake by far.
    const next = urls.filter((_, j) => j !== i);
    onChange(next.join("\n"));
  }

  return (
    <div>
      <label className="block text-xs font-medium">{label}</label>

      {urls.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {urls.map((url, i) => (
            <li
              key={url}
              className="group relative size-20 overflow-hidden rounded-lg border border-border bg-bg"
            >
              <Image
                src={url}
                alt=""
                fill
                unoptimized
                sizes="80px"
                className="object-cover"
              />
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label="Remove this image"
                className="absolute inset-0 flex items-center justify-center bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : urls.length ? (
            <ImagePlus className="size-3.5" aria-hidden="true" />
          ) : (
            <Upload className="size-3.5" aria-hidden="true" />
          )}
          {busy
            ? "Uploading…"
            : urls.length
              ? "Add another"
              : multiple
                ? "Upload images"
                : "Upload an image"}
        </button>

        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple={multiple}
          className="hidden"
          onChange={(e) => e.target.files?.length && upload(e.target.files)}
        />
      </div>

      {/* Kept, and second. The ten projects already here point at
          highscore's bucket; removing this would mean re-uploading every
          image to change a title. */}
      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] text-fg-subtle">
          or paste a link
        </summary>
        {multiple ? (
          <textarea
            rows={3}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="One URL per line"
            className="mt-1.5 w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs"
          />
        ) : (
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://…"
            className="mt-1.5 w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs"
          />
        )}
      </details>

      {error ? (
        <p className="mt-2 text-[11px] text-chart-down">{error}</p>
      ) : null}
      {hint && !error ? (
        <p className="mt-1 text-[11px] text-fg-muted">{hint}</p>
      ) : null}
    </div>
  );
}
