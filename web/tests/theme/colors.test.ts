import { describe, expect, it } from "vitest";

import {
  MODE_COLORS,
  NETWORK_ALPHA_BY_CLASS,
  networkColor,
  parseHexColor,
  routeColor,
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
      (cls) => networkColor({ class: cls, underground: false })[3],
    );
    expect(alphas).toEqual(NETWORK_ALPHA_BY_CLASS.slice(1));
    expect(alphas.every((alpha, i) => i === 0 || alpha > (alphas[i - 1] ?? 0))).toBe(true);
  });

  it("dims underground segments", () => {
    const surface = networkColor({ class: 5, underground: false });
    const underground = networkColor({ class: 5, underground: true });
    expect(underground[3]).toBeLessThan(surface[3]);
    expect(underground.slice(0, 3)).toEqual(surface.slice(0, 3));
  });

  it("clamps classes outside 1 to 5", () => {
    expect(networkColor({ class: 0, underground: false })[3]).toBe(NETWORK_ALPHA_BY_CLASS[1]);
    expect(networkColor({ class: 9, underground: false })[3]).toBe(NETWORK_ALPHA_BY_CLASS[5]);
  });
});
