import { describe, expect, it } from "vitest";

import { CAMERA_EASE_MS, easeDurationMs, prefersReducedMotion } from "../../src/theme/motion";

describe("easeDurationMs", () => {
  it("eases the camera normally, and moves it at once under reduced motion", () => {
    expect(easeDurationMs(false)).toBe(CAMERA_EASE_MS);
    expect(easeDurationMs(true)).toBe(0);
    expect(CAMERA_EASE_MS).toBeGreaterThan(0);
  });
});

describe("prefersReducedMotion", () => {
  it("reads the media query and stays false when the browser has none", () => {
    expect(prefersReducedMotion({ matchMedia: () => ({ matches: true }) })).toBe(true);
    expect(prefersReducedMotion({ matchMedia: () => ({ matches: false }) })).toBe(false);
    expect(prefersReducedMotion({})).toBe(false);
  });
});
