import { describe, expect, it } from "vitest";

import { decodeSlice } from "../../src/data/stv1";
import { UNKNOWN_ROUTE_COLOR, pathColors, vertexColors } from "../../src/render/colors";
import { MANIFEST } from "../helpers/fixtures";
import { encodeSlice } from "../helpers/stv1";

const slice = decodeSlice(
  encodeSlice(8, [
    {
      lon: [4.35, 4.36, 4.37],
      lat: [50.85, 50.851, 50.852],
      t: [100, 160, 220],
      vehicle: 0,
      trip: 0,
      route: 1,
    },
    { lon: [4.4, 4.41], lat: [50.8, 50.81], t: [3000, 3090], vehicle: 1, trip: 0, route: 0 },
    { lon: [4.5, 4.51], lat: [50.7, 50.71], t: [4000, 4090], vehicle: 2, trip: 0, route: 9 },
  ]),
);

describe("vertexColors", () => {
  it("unfolds one opaque RGBA colour per vertex from the route of its path", () => {
    const colors = vertexColors(slice, MANIFEST.routes);
    expect(colors).toHaveLength(4 * slice.vertices);
    expect(Array.from(colors.subarray(0, 4))).toEqual([239, 224, 72, 255]);
    expect(Array.from(colors.subarray(8, 12))).toEqual([239, 224, 72, 255]);
    expect(Array.from(colors.subarray(12, 16))).toEqual([255, 232, 196, 255]);
  });

  it("paints an unknown route index in the neutral colour", () => {
    const colors = vertexColors(slice, MANIFEST.routes);
    expect(Array.from(colors.subarray(20, 24))).toEqual([...UNKNOWN_ROUTE_COLOR, 255]);
  });
});

describe("pathColors", () => {
  it("gives one colour per path", () => {
    const colors = pathColors(slice, MANIFEST.routes);
    expect(colors).toHaveLength(4 * slice.paths);
    expect(Array.from(colors.subarray(4, 8))).toEqual([255, 232, 196, 255]);
  });
});
