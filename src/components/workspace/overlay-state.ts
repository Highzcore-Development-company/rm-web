/**
 * The chart draws a position's entry, stop and target once, when it loads.
 * They have to be redrawn when a position opens or closes underneath it, or a
 * closed trade keeps its lines until the next reload.
 */
export function overlayNeedsRebuild(prev: string | null, next: string | null): boolean {
  return prev !== next && (prev === "active" || next === "active");
}
