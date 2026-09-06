/**
 * Rendering quality against cost (ARCHITECTURE.md, section 6.3).
 *
 * A dense screen asks deck.gl to fill four times the fragments for the same picture. At the
 * 17:03 peak that is the difference between a smooth animation and a jerky one, for trails two
 * pixels wide and dots of three where the extra resolution is barely visible.
 */

/** Highest ratio worth rendering at; a denser screen is capped here. */
export const MAX_DEVICE_PIXEL_RATIO = 1.5;

/** The value to give deck.gl's `useDevicePixels` for a screen of this ratio. */
export function devicePixels(ratio: number): number {
  if (!Number.isFinite(ratio)) {
    return Number.isNaN(ratio) ? 1 : MAX_DEVICE_PIXEL_RATIO;
  }
  if (ratio <= 0) {
    return 1;
  }
  return Math.min(ratio, MAX_DEVICE_PIXEL_RATIO);
}
