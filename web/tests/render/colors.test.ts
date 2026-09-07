import { describe, expect, it } from "vitest";

import type { RouteInfo } from "../../src/data/contract";
import { decodeSlice } from "../../src/data/stv1";
import {
  DIMMED_ALPHA,
  UNKNOWN_ROUTE_COLOR,
  pathColors,
  vertexColors,
} from "../../src/render/colors";
import { MODE_COLORS } from "../../src/theme/colors";
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
    expect(Array.from(colors.subarray(0, 4))).toEqual([...MODE_COLORS.tram, 255]);
    expect(Array.from(colors.subarray(8, 12))).toEqual([...MODE_COLORS.tram, 255]);
    expect(Array.from(colors.subarray(12, 16))).toEqual([255, 232, 196, 255]);
  });

  it("paints an unknown route index in the neutral colour", () => {
    const colors = vertexColors(slice, MANIFEST.routes);
    expect(Array.from(colors.subarray(20, 24))).toEqual([...UNKNOWN_ROUTE_COLOR, 255]);
  });
});

describe("colour options", () => {
  it("paints buses in their official colour under the official scheme", () => {
    const tram = MANIFEST.routes[1];
    if (tram === undefined) {
      throw new Error("fixture route missing");
    }
    const routes: RouteInfo[] = [
      ...MANIFEST.routes,
      { ...tram, id: "12", name: "12", mode: "bus", color: "4C8B33" },
    ];
    const bus = decodeSlice(
      encodeSlice(8, [
        { lon: [4.4, 4.41], lat: [50.8, 50.81], t: [1, 2], vehicle: 0, trip: 0, route: 2 },
      ]),
    );
    expect(Array.from(vertexColors(bus, routes).subarray(0, 3))).toEqual([96, 170, 255]);
    expect(Array.from(vertexColors(bus, routes, { scheme: "official" }).subarray(0, 3))).toEqual([
      76, 139, 51,
    ]);
  });

  it("paints trams in the tram colour by default, in their official colour on demand", () => {
    const palette = vertexColors(slice, MANIFEST.routes);
    expect(Array.from(palette.subarray(0, 3))).toEqual([...MODE_COLORS.tram]);
    const official = vertexColors(slice, MANIFEST.routes, { scheme: "official" });
    expect(Array.from(official.subarray(0, 3))).toEqual([239, 224, 72]);
  });

  it("dims every route but the selected line, by line name, in vertices and in heads", () => {
    const options = { line: "7" };
    const routes = MANIFEST.routes.map((route) => ({ ...route, id: `gtfs-${route.id}` }));
    const vertices = vertexColors(slice, routes, options);
    expect(vertices[3]).toBe(255);
    expect(vertices[15]).toBe(DIMMED_ALPHA);
    const paths = pathColors(slice, routes, options);
    expect(paths[3]).toBe(255);
    expect(paths[7]).toBe(DIMMED_ALPHA);
    expect(DIMMED_ALPHA).toBeLessThan(80);
  });
});

describe("pathColors", () => {
  it("gives one colour per path", () => {
    const colors = pathColors(slice, MANIFEST.routes);
    expect(colors).toHaveLength(4 * slice.paths);
    expect(Array.from(colors.subarray(4, 8))).toEqual([255, 232, 196, 255]);
  });
});
