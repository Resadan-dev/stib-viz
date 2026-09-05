import { describe, expect, it } from "vitest";

import type { StopsFile } from "../../src/data/stops";
import { decodeSlice } from "../../src/data/stv1";
import { createHeadBuffers, computeHeads, mountSlice } from "../../src/render/heads";
import {
  currentTrip,
  describeVehicle,
  headAt,
  stepVehicle,
  vehiclesOnLine,
} from "../../src/render/selection";
import { MANIFEST, NETWORK, VEHICLES } from "../helpers/fixtures";
import { encodeSlice } from "../helpers/stv1";

const STOPS: StopsFile = {
  "0:0": [
    [14400, "1000"],
    [15000, "2788"],
    [16200, "9999"],
  ],
  "0:1": [[16500, "2788"]],
};

describe("currentTrip", () => {
  it("finds the trip under way, or none between trips", () => {
    const vehicle = VEHICLES[0];
    if (vehicle === undefined) {
      throw new Error("fixture vehicle missing");
    }
    expect(currentTrip(vehicle, 14400)).toBe(0);
    expect(currentTrip(vehicle, 16200)).toBe(0);
    expect(currentTrip(vehicle, 16300)).toBeNull();
    expect(currentTrip(vehicle, 17000)).toBe(1);
    expect(currentTrip(vehicle, 99999)).toBeNull();
  });
});

describe("describeVehicle", () => {
  it("describes a running vehicle with its next stop and scheduled time", () => {
    const description = describeVehicle(0, VEHICLES, MANIFEST.routes, 14700, STOPS, NETWORK.stops);
    expect(description).toMatchObject({
      status: "running",
      block: "10474607",
      headsign: "STOCKEL",
      tripIndex: 0,
      start: 14400,
      end: 16200,
      nextStop: { name: "BOURSE", time: 15000 },
    });
    expect(description?.route?.name).toBe("1");
  });

  it("falls back to the stop id when the network does not name it, and to no stop at the terminus", () => {
    expect(
      describeVehicle(0, VEHICLES, MANIFEST.routes, 15500, STOPS, NETWORK.stops)?.nextStop,
    ).toEqual({
      name: "9999",
      time: 16200,
    });
    expect(
      describeVehicle(0, VEHICLES, MANIFEST.routes, 16200, STOPS, NETWORK.stops)?.nextStop,
    ).toBeNull();
  });

  it("describes a layover by the trip to come, and an off-duty vehicle without route", () => {
    const layover = describeVehicle(0, VEHICLES, MANIFEST.routes, 16300, STOPS, NETWORK.stops);
    expect(layover).toMatchObject({ status: "layover", headsign: "GARE DE L OUEST", start: 16500 });
    const off = describeVehicle(0, VEHICLES, MANIFEST.routes, 99999, STOPS, NETWORK.stops);
    expect(off).toMatchObject({ status: "off", route: null, headsign: null, nextStop: null });
    expect(
      describeVehicle(0, VEHICLES, MANIFEST.routes, 14700, null, NETWORK.stops)?.nextStop,
    ).toBeNull();
  });

  it("returns null for an unknown vehicle", () => {
    expect(describeVehicle(42, VEHICLES, MANIFEST.routes, 14700, STOPS, NETWORK.stops)).toBeNull();
  });
});

const PICK_SLICE = decodeSlice(
  encodeSlice(8, [
    { lon: [4.35, 4.36], lat: [50.85, 50.86], t: [100, 200], vehicle: 3, trip: 2, route: 0 },
    { lon: [4.4, 4.41], lat: [50.8, 50.81], t: [100, 200], vehicle: 5, trip: 0, route: 1 },
    { lon: [4.42, 4.43], lat: [50.82, 50.83], t: [100, 200], vehicle: 9, trip: 1, route: 1 },
  ]),
);

describe("headAt", () => {
  it("maps a picked head back to its vehicle and trip", () => {
    const mounted = [mountSlice("tram", PICK_SLICE, MANIFEST.routes)];
    const buffers = createHeadBuffers(3);
    const count = computeHeads(mounted, 150, null, buffers);
    expect(count).toBe(3);
    expect(headAt(mounted, buffers, 1)).toEqual({ vehicle: 5, trip: 0 });
    expect(headAt(mounted, buffers, 0)).toEqual({ vehicle: 3, trip: 2 });
    expect(headAt(mounted, buffers, 7)).toBeUndefined();
  });
});

describe("vehiclesOnLine", () => {
  it("lists the drawn vehicles of a line by name, sorted", () => {
    const mounted = [mountSlice("tram", PICK_SLICE, MANIFEST.routes)];
    const buffers = createHeadBuffers(3);
    const count = computeHeads(mounted, 150, null, buffers);
    expect(vehiclesOnLine(mounted, buffers, count, MANIFEST.routes, "7")).toEqual([5, 9]);
    expect(vehiclesOnLine(mounted, buffers, count, MANIFEST.routes, "1")).toEqual([3]);
    expect(vehiclesOnLine(mounted, buffers, count, MANIFEST.routes, "55")).toEqual([]);
  });
});

describe("stepVehicle", () => {
  it("cycles through the list from the current vehicle, or enters it from either end", () => {
    expect(stepVehicle([5, 9], null, 1)).toBe(5);
    expect(stepVehicle([5, 9], null, -1)).toBe(9);
    expect(stepVehicle([5, 9], 5, 1)).toBe(9);
    expect(stepVehicle([5, 9], 9, 1)).toBe(5);
    expect(stepVehicle([5, 9], 5, -1)).toBe(9);
    expect(stepVehicle([5, 9], 42, 1)).toBe(5);
    expect(stepVehicle([], null, 1)).toBeNull();
  });
});
