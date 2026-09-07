import { describe, expect, it } from "vitest";

import type { Vehicle } from "../../src/data/contract";
import { decodeSlice } from "../../src/data/stv1";
import {
  LAYOVER_MAX_M,
  computeHeads,
  createHeadBuffers,
  distanceM,
  indexByVehicle,
  mountSlice,
  positionAt,
  recolour,
} from "../../src/render/heads";
import { MODE_COLORS } from "../../src/theme/colors";
import { MANIFEST } from "../helpers/fixtures";
import { encodeSlice } from "../helpers/stv1";

const STOP = { lon: 4.37, lat: 50.852 };
const slice = decodeSlice(
  encodeSlice(8, [
    // Vehicle 0: a trip ending at STOP, then after a layover a trip leaving STOP.
    {
      lon: [4.35, 4.36, STOP.lon],
      lat: [50.85, 50.851, STOP.lat],
      t: [100, 160, 220],
      vehicle: 0,
      trip: 0,
      route: 1,
    },
    {
      lon: [STOP.lon, 4.38],
      lat: [STOP.lat, 50.853],
      t: [400, 460],
      vehicle: 0,
      trip: 1,
      route: 1,
    },
    // Vehicle 1: a single trip later on.
    { lon: [4.4, 4.41], lat: [50.8, 50.81], t: [3000, 3090], vehicle: 1, trip: 0, route: 0 },
    // Vehicle 2: a deadhead move between two distant termini.
    { lon: [4.29, 4.3], lat: [50.79, 50.8], t: [440, 500], vehicle: 2, trip: 0, route: 0 },
    { lon: [4.4, 4.41], lat: [50.9, 50.91], t: [800, 860], vehicle: 2, trip: 1, route: 0 },
    // Vehicle 3: its second trip starts in this slice, the first ended before it.
    { lon: [4.33, 4.34], lat: [50.83, 50.84], t: [1000, 1060], vehicle: 3, trip: 1, route: 1 },
    // Vehicle 4: its first trip ends here, the next one starts after the slice.
    { lon: [4.31, 4.32], lat: [50.81, 50.82], t: [1940, 2000], vehicle: 4, trip: 0, route: 1 },
  ]),
);

const mounted = mountSlice("tram", slice, MANIFEST.routes);

function vehiclesWith(layoverAt3: boolean, layoverAt4: boolean): Vehicle[] {
  const trip = (start: number, end: number, from_layover: boolean) => ({
    route_idx: 1,
    headsign: "X",
    start,
    end,
    from_layover,
  });
  return [
    { block: "0", trips: [trip(100, 220, false), trip(400, 460, true)] },
    { block: "1", trips: [trip(3000, 3090, false)] },
    { block: "2", trips: [trip(440, 500, false), trip(800, 860, false)] },
    { block: "3", trips: [trip(0, 900, false), trip(1000, 1060, layoverAt3)] },
    { block: "4", trips: [trip(1940, 2000, false), trip(2300, 2400, layoverAt4)] },
  ];
}

function heads(t: number, vehicles: Vehicle[] | null = null) {
  const out = createHeadBuffers(slice.paths);
  const count = computeHeads([mounted], t, vehicles, out);
  const result: { vehicle: number; lon: number; lat: number; color: number[] }[] = [];
  for (let i = 0; i < count; i += 1) {
    const path = out.path[i] ?? -1;
    result.push({
      vehicle: slice.vehicle[path] ?? -1,
      lon: out.positions[2 * i] ?? Number.NaN,
      lat: out.positions[2 * i + 1] ?? Number.NaN,
      color: Array.from(out.colors.subarray(4 * i, 4 * i + 4)),
    });
  }
  return result;
}

describe("distanceM", () => {
  it("measures a Brussels block to the metre", () => {
    expect(distanceM(4.35, 50.85, 4.35, 50.851)).toBeCloseTo(111.2, 0);
    expect(distanceM(4.35, 50.85, 4.351, 50.85)).toBeCloseTo(70.2, 0);
    expect(LAYOVER_MAX_M).toBe(100);
  });
});

describe("indexByVehicle", () => {
  it("groups the paths of each vehicle in time order", () => {
    const groups = indexByVehicle(slice);
    expect(groups.map((group) => group.vehicle)).toEqual([0, 1, 2, 3, 4]);
    expect(groups[0]?.paths).toEqual([0, 1]);
    expect(groups[2]?.paths).toEqual([3, 4]);
  });
});

describe("positionAt", () => {
  it("interpolates between the two vertices around the instant", () => {
    const out = new Float32Array(2);
    positionAt(slice, 0, 130, out, 0);
    expect(out[0]).toBeCloseTo(4.355, 5);
    expect(out[1]).toBeCloseTo(50.8505, 4);
    positionAt(slice, 0, 220, out, 0);
    expect(out[0]).toBeCloseTo(STOP.lon, 5);
  });
});

describe("recolour", () => {
  it("returns a new mounted slice with new colours and the same geometry", () => {
    const again = recolour(mounted, MANIFEST.routes, { line: "1" });
    expect(again).not.toBe(mounted);
    expect(again.slice).toBe(mounted.slice);
    expect(again.byVehicle).toBe(mounted.byVehicle);
    expect(again.vertexColors).not.toBe(mounted.vertexColors);
    expect(again.pathColors[3]).toBeLessThan(255);
    expect(again.pathColors[2 * 4 + 3]).toBe(255);
  });
});

describe("computeHeads", () => {
  it("places a running vehicle on its path with the colour of its route", () => {
    const result = heads(130);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ vehicle: 0, color: [...MODE_COLORS.tram, 255] });
    expect(result[0]?.lon).toBeCloseTo(4.355, 5);
  });

  it("holds a vehicle at the terminus during a layover between two of its paths", () => {
    const result = heads(300);
    expect(result).toHaveLength(1);
    expect(result[0]?.vehicle).toBe(0);
    expect(result[0]?.lon).toBeCloseTo(STOP.lon, 5);
    expect(result[0]?.lat).toBeCloseTo(STOP.lat, 4);
  });

  it("draws nothing during a deadhead move", () => {
    expect(heads(600).map((head) => head.vehicle)).toEqual([]);
    expect(heads(480).map((head) => head.vehicle)).toEqual([2]);
  });

  it("holds a vehicle before its first path only when the trip list says it waited there", () => {
    expect(heads(950)).toHaveLength(0);
    expect(heads(950, vehiclesWith(false, false))).toHaveLength(0);
    const held = heads(950, vehiclesWith(true, false));
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ vehicle: 3 });
    expect(held[0]?.lon).toBeCloseTo(4.33, 5);
    expect(heads(850, vehiclesWith(true, false)).map((head) => head.vehicle)).toEqual([2]);
  });

  it("holds a vehicle after its last path until its next trip starts", () => {
    expect(heads(2100)).toHaveLength(0);
    const held = heads(2100, vehiclesWith(false, true));
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ vehicle: 4 });
    expect(held[0]?.lon).toBeCloseTo(4.32, 5);
    expect(heads(2350, vehiclesWith(false, true))).toHaveLength(0);
  });

  it("ignores instants outside every path", () => {
    expect(heads(50)).toHaveLength(0);
    expect(heads(5000)).toHaveLength(0);
  });

  it("refuses to overflow the buffers", () => {
    const out = createHeadBuffers(0);
    expect(() => computeHeads([mounted], 130, null, out)).toThrow(RangeError);
  });
});
