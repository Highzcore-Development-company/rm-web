import { createClient } from "@/lib/supabase/server";

/**
 * Highscore Studio's work.
 *
 * Read through RLS like the portfolio, so a draft is invisible to a visitor
 * because the POLICY hides it rather than because this file filters.
 */

export type StudioWork = {
  id: string;
  title: string;
  client: string | null;
  projectType: string | null;
  summary: string | null;
  /** The YouTube id, extracted — see youtubeId. Null if it is not YouTube. */
  youtubeId: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
  published: boolean;
};

/**
 * The id out of a YouTube URL, or null.
 *
 * EXTRACTED RATHER THAN EMBEDDED WHOLE, because a watch?v= link cannot go in
 * an iframe — YouTube refuses to frame it — and the embed path needs the
 * bare id. Handles the three forms these arrive in: watch?v=, youtu.be/ and
 * an already-embed URL.
 *
 * Returns null for anything else, and the caller falls back to a link. A
 * made-up id would render a player showing someone else's video.
 */
export function youtubeId(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return u.pathname.slice(1) || null;
    if (host.endsWith("youtube.com")) {
      if (u.pathname.startsWith("/embed/")) return u.pathname.slice(7) || null;
      return u.searchParams.get("v");
    }
  } catch {
    // Not a URL at all. Null, and the page links out instead of framing it.
  }
  return null;
}

export async function listStudioWorks(): Promise<StudioWork[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("studio_works")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    // An empty studio and an unreadable one look the same on screen, and
    // only one of them is somebody's fault.
    console.error("[studio] could not read works:", error.message);
    return [];
  }

  return (data as unknown as {
    id: string;
    title: string;
    client: string | null;
    project_type: string | null;
    summary: string | null;
    video_url: string | null;
    poster_url: string | null;
    published: boolean;
  }[]).map((w) => ({
    id: w.id,
    title: w.title,
    client: w.client,
    projectType: w.project_type,
    summary: w.summary,
    youtubeId: youtubeId(w.video_url),
    videoUrl: w.video_url,
    posterUrl: w.poster_url,
    published: w.published,
  }));
}
