import { describe, expect, it } from "vitest";

import {
  MODE_COLORS,
  NETWORK_ALPHA_BY_CLASS,
  SPEED_SCALE_KMH,
  UNKNOWN_SPEED_COLOR,
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
  it("grows brighter with speed, so the ramp reads without its hues", () => {
    const [slow, fast] = SPEED_SCALE_KMH;
    const steps = [slow, (slow + fast) / 2, fast].map((kmh) => luminance(speedColor(kmh)));
    expect(steps[0]).toBeLessThan(steps[1] ?? 0);
    expect(steps[1]).toBeLessThan(steps[2] ?? 0);
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
