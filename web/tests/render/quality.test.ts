import { describe, expect, it } from "vitest";

import { MAX_DEVICE_PIXEL_RATIO, devicePixels } from "../../src/render/quality";

describe("devicePixels", () => {
  it("keeps the screen ratio when it is modest and caps a dense one", () => {
    expect(devicePixels(1)).toBe(1);
    expect(devicePixels(1.25)).toBe(1.25);
    expect(devicePixels(2)).toBe(MAX_DEVICE_PIXEL_RATIO);
    expect(devicePixels(3)).toBe(MAX_DEVICE_PIXEL_RATIO);
    expect(MAX_DEVICE_PIXEL_RATIO).toBeLessThan(2);
  });

  it("falls back to one pixel per pixel for a ratio it cannot use", () => {
    expect(devicePixels(0)).toBe(1);
    expect(devicePixels(-2)).toBe(1);
    expect(devicePixels(Number.NaN)).toBe(1);
    expect(devicePixels(Number.POSITIVE_INFINITY)).toBe(MAX_DEVICE_PIXEL_RATIO);
  });
});
