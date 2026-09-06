/**
 * Motion the visitor did not ask for (ARCHITECTURE.md, section 6.6).
 *
 * The vehicles moving are the point of the site, so they always move. Everything else the page
 * animates on its own, the camera easing, is skipped when the visitor prefers reduced motion,
 * and playback then starts paused.
 */

/** How long the camera takes to slide onto a vehicle when stepping to it. */
export const CAMERA_EASE_MS = 700;

export function easeDurationMs(reducedMotion: boolean): number {
  return reducedMotion ? 0 : CAMERA_EASE_MS;
}

/** Narrow view of `window`, so the preference can be read in a test without a browser. */
export interface MediaQueryHost {
  matchMedia?: (query: string) => { matches: boolean };
}

export function prefersReducedMotion(host: MediaQueryHost): boolean {
  return host.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
