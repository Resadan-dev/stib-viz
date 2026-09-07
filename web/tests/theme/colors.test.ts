import { describe, expect, it } from "vitest";

import {
  DEVIATION_SCALE,
  DEVIATION_USUAL,
  MODE_COLORS,
  NETWORK_ALPHA_BY_CLASS,
  SPEED_SCALE_KMH,
  UNKNOWN_SPEED_COLOR,
  deviationColor,
  networkColor,
  parseHexColor,
  routeColor,
  speedColor,
} from "../../src/theme/colors";
import { MANIFEST } from "../helpers/fixtures";

const metro = MANIFEST.routes[0];
const tram = MANIFEST.routes[1];
if (metro === undefined || tram === undefined) {
  throw new Error("fixture routes missing");
}

describe("parseHexColor", () => {
  it("reads six hexadecimal digits", () => {
    expect(parseHexColor("EFE048")).toEqual([239, 224, 72]);
    expect(parseHexColor("b5378c")).toEqual([181, 55, 140]);
  });

  it("rejects anything else", () => {
    expect(parseHexColor("FFF")).toBeUndefined();
    expect(parseHexColor("GGGGGG")).toBeUndefined();
    expect(parseHexColor("")).toBeUndefined();
  });
});

describe("routeColor", () => {
  it("gives trams their official colour", () => {
    expect(routeColor(tram)).toEqual([239, 224, 72]);
  });

  it("gives every other mode the palette colour, whatever the feed says", () => {
    expect(routeColor(metro)).toEqual(MODE_COLORS.metro);
    expect(routeColor({ ...tram, mode: "bus" })).toEqual(MODE_COLORS.bus);
    expect(routeColor({ ...tram, mode: "noctis" })).toEqual(MODE_COLORS.noctis);
  });

  it("falls back to the palette when the tram colour is unreadable", () => {
    expect(routeColor({ ...tram, color: "nope" })).toEqual(MODE_COLORS.tram);
  });

  it("gives every mode its official colour under the official scheme", () => {
    expect(routeColor(metro, "official")).toEqual([181, 55, 140]);
    expect(routeColor({ ...tram, mode: "bus", color: "4C8B33" }, "official")).toEqual([
      76, 139, 51,
    ]);
    expect(routeColor({ ...tram, mode: "noctis", color: "nope" }, "official")).toEqual(
      MODE_COLORS.noctis,
    );
    expect(routeColor(metro, "palette")).toEqual(MODE_COLORS.metro);
  });
});

describe("networkColor", () => {
  it("brightens with the intensity class", () => {
    const alphas = [1, 2, 3, 4, 5].map(
      (cls) => networkColor({ class: cls, underground: false, speed: 20 })[3],
    );
    expect(alphas).toEqual(NETWORK_ALPHA_BY_CLASS.slice(1));
    expect(alphas.every((alpha, i) => i === 0 || alpha > (alphas[i - 1] ?? 0))).toBe(true);
  });

  it("dims underground segments", () => {
    const surface = networkColor({ class: 5, underground: false, speed: 20 });
    const underground = networkColor({ class: 5, underground: true, speed: 20 });
    expect(underground[3]).toBeLessThan(surface[3]);
    expect(underground.slice(0, 3)).toEqual(surface.slice(0, 3));
  });

  it("clamps classes outside 1 to 5", () => {
    expect(networkColor({ class: 0, underground: false, speed: 20 })[3]).toBe(
      NETWORK_ALPHA_BY_CLASS[1],
    );
    expect(networkColor({ class: 9, underground: false, speed: 20 })[3]).toBe(
      NETWORK_ALPHA_BY_CLASS[5],
    );
  });
});

/** Relative luminance, the quantity a ramp must climb for colour-blind readers to follow it. */
function luminance([r, g, b]: readonly [number, number, number]): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe("speedColor", () => {
  it("grows brighter at every step of the scale, so the ramp reads without its hues", () => {
    const [slow, fast] = SPEED_SCALE_KMH;
    const steps = Array.from({ length: 33 }, (_, i) =>
      luminance(speedColor(slow + ((fast - slow) * i) / 32)),
    );
    steps.forEach((step, i) => {
      if (i > 0) {
        expect(step, `luminance falls at step ${String(i)}`).toBeGreaterThan(steps[i - 1] ?? 0);
      }
    });
    // Wide enough that the slow end sinks into the night ground and the fast end glows on it.
    expect(steps[0]).toBeLessThan(60);
    expect(steps[steps.length - 1]).toBeGreaterThan(200);
  });

  it("spends its ramp on the network it describes, not on the tail of the metro", () => {
    // Measured on the feed of 31 August 2026: half the segments of a weekday sit between these.
    const [slow, fast] = SPEED_SCALE_KMH;
    const at = (kmh: number): number => (kmh - slow) / (fast - slow);
    expect(at(14)).toBeGreaterThan(0.1);
    expect(at(20)).toBeLessThan(0.7);
    expect(at(20) - at(14)).toBeGreaterThan(0.25);
  });

  it("holds its ends beyond the scale rather than inventing colours", () => {
    const [slow, fast] = SPEED_SCALE_KMH;
    expect(speedColor(0)).toEqual(speedColor(slow));
    expect(speedColor(200)).toEqual(speedColor(fast));
    expect(slow).toBeGreaterThan(0);
    expect(fast).toBeGreaterThan(slow);
  });
});

describe("networkColor in the speed view", () => {
  it("paints a segment with its speed, at an opacity the runs view never reaches", () => {
    const fast = networkColor({ class: 1, underground: false, speed: 40 }, "speed");
    const slow = networkColor({ class: 5, underground: false, speed: 8 }, "speed");
    expect(fast.slice(0, 3)).toEqual(speedColor(40));
    expect(slow.slice(0, 3)).toEqual(speedColor(8));
    expect(fast[3]).toBe(slow[3]);
    expect(fast[3]).toBeGreaterThan(Math.max(...NETWORK_ALPHA_BY_CLASS));
  });

  it("does not dim the metro: underground is where the speed is", () => {
    const surface = networkColor({ class: 5, underground: false, speed: 35 }, "speed");
    const underground = networkColor({ class: 5, underground: true, speed: 35 }, "speed");
    expect(underground).toEqual(surface);
  });

  it("shows an unknown speed as a neutral, never as the slowest", () => {
    const unknown = networkColor({ class: 3, underground: false, speed: null }, "speed");
    expect(unknown).toEqual(UNKNOWN_SPEED_COLOR);
    expect(unknown.slice(0, 3)).not.toEqual(speedColor(SPEED_SCALE_KMH[0]));
  });

  it("is the runs view when asked for it, whatever the speed", () => {
    const paint = { class: 3, underground: false, speed: 40 };
    expect(networkColor(paint, "runs")).toEqual(networkColor(paint));
  });
});

describe("deviationColor", () => {
  const [slowest, fastest] = DEVIATION_SCALE;

  it("puts the usual speed at the bottom of the ramp, and both departures above it", () => {
    // A diverging scale on a night ground: an ordinary hour sinks into it, and a segment that
    // leaves its habit in either direction lights up. Direction is carried by hue, not by
    // brightness, so the two arms must climb away from a neutral that is dimmer than both.
    expect(deviationColor(1)).toEqual(DEVIATION_USUAL);
    expect(luminance(deviationColor(1))).toBeLessThan(luminance(deviationColor(slowest)));
    expect(luminance(deviationColor(1))).toBeLessThan(luminance(deviationColor(fastest)));
  });

  it("tells the two directions apart by hue, which blue against orange does for every eye", () => {
    const slow = deviationColor(slowest);
    const fast = deviationColor(fastest);
    // Blue against orange survives every common kind of colour blindness, where red against
    // green would not: the slow arm is bluest, the fast arm reddest.
    expect(slow[2]).toBeGreaterThan(slow[0]);
    expect(fast[0]).toBeGreaterThan(fast[2]);
  });

  it("climbs away from the usual speed without a step at the middle", () => {
    const around = [0.98, 0.99, 1, 1.01, 1.02].map(deviationColor);
    for (const colour of around) {
      for (let channel = 0; channel < 3; channel += 1) {
        expect(Math.abs((colour[channel] ?? 0) - (DEVIATION_USUAL[channel] ?? 0))).toBeLessThan(20);
      }
    }
  });

  it("holds its ends beyond the scale rather than inventing colours", () => {
    expect(deviationColor(0.1)).toEqual(deviationColor(slowest));
    expect(deviationColor(9)).toEqual(deviationColor(fastest));
    expect(slowest).toBeLessThan(1);
    expect(fastest).toBeGreaterThan(1);
  });
});

describe("networkColor in the deviation view", () => {
  const paint = { class: 3, underground: false, speed: 16 };

  it("paints how far the hour is from the habit of the segment, not how fast it is", () => {
    expect(networkColor({ ...paint, deviation: 0.8 }, "relative").slice(0, 3)).toEqual(
      deviationColor(0.8),
    );
    expect(networkColor({ ...paint, deviation: 1.3 }, "relative").slice(0, 3)).toEqual(
      deviationColor(1.3),
    );
    // The speed of the segment says nothing here: two segments that keep their habit match.
    const slow = networkColor({ ...paint, speed: 9, deviation: 1 }, "relative");
    const quick = networkColor({ ...paint, speed: 34, deviation: 1 }, "relative");
    expect(slow).toEqual(quick);
  });

  it("shows an hour it cannot compare as unknown, the way the speed view does", () => {
    expect(networkColor({ ...paint, deviation: null }, "relative")).toEqual(UNKNOWN_SPEED_COLOR);
    expect(networkColor(paint, "relative")).toEqual(UNKNOWN_SPEED_COLOR);
  });
});
