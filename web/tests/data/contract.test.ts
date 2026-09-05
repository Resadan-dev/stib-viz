import { describe, expect, it } from "vitest";

import {
  DataError,
  MODES,
  parseIndex,
  parseManifest,
  parseNetwork,
  parseVehicles,
} from "../../src/data/contract";
import { INDEX, MANIFEST, NETWORK, VEHICLES, patched } from "../helpers/fixtures";

describe("modes", () => {
  it("lists the four modes in display order", () => {
    expect(MODES).toEqual(["metro", "tram", "bus", "noctis"]);
  });
});

describe("parseIndex", () => {
  it("accepts the index written by the pipeline", () => {
    expect(parseIndex(INDEX)).toEqual(INDEX);
  });

  it("rejects a value that is not an object", () => {
    expect(() => parseIndex("index")).toThrow(DataError);
    expect(() => parseIndex(null)).toThrow(/object/);
  });

  it("rejects a missing day list", () => {
    expect(() => parseIndex(patched(INDEX, { days: undefined }))).toThrow(/days/);
  });

  it("rejects a day without a manifest path", () => {
    expect(() =>
      parseIndex(
        patched(INDEX, { days: [{ date: "2026-09-09", kind: "weekday", source: "schedule" }] }),
      ),
    ).toThrow(/manifest/);
  });
});

describe("parseManifest", () => {
  it("accepts the manifest written by the pipeline", () => {
    const manifest = parseManifest(MANIFEST);
    expect(manifest.routes[0]?.mode).toBe("metro");
    expect(manifest.slices).toHaveLength(2);
    expect(manifest.per_minute.vehicles.tram).toHaveLength(1440);
  });

  it("rejects an unknown mode", () => {
    const routes = [{ ...MANIFEST.routes[0], mode: "boat" }];
    expect(() => parseManifest(patched(MANIFEST, { routes }))).toThrow(/mode/);
  });

  it("rejects a per-minute series of the wrong length", () => {
    const per_minute = {
      ...MANIFEST.per_minute,
      km: { ...MANIFEST.per_minute.km, bus: [1, 2, 3] },
    };
    expect(() => parseManifest(patched(MANIFEST, { per_minute }))).toThrow(/1440/);
  });

  it("rejects a slice entry without its counts", () => {
    const slices = [{ hour: 8, mode: "metro", path: "slices/08-metro.bin" }];
    expect(() => parseManifest(patched(MANIFEST, { slices }))).toThrow(/bytes/);
  });

  it("rejects a missing vehicles file", () => {
    expect(() => parseManifest(patched(MANIFEST, { vehicles_file: 12 }))).toThrow(/vehicles_file/);
  });
});

describe("parseNetwork", () => {
  it("accepts the network layer written by the pipeline", () => {
    const network = parseNetwork(NETWORK);
    expect(network.features).toHaveLength(2);
    expect(network.stops["1000"]?.[2]).toBe("DE BROUCKERE");
  });

  it("rejects a feature without an intensity class", () => {
    const feature = {
      ...NETWORK.features[0],
      properties: { mode: "tram", from: "1000", to: "2788", runs: 3, underground: false },
    };
    expect(() => parseNetwork(patched(NETWORK, { features: [feature] }))).toThrow(/class/);
  });

  it("rejects a stop that is not [lon, lat, name]", () => {
    expect(() => parseNetwork(patched(NETWORK, { stops: { "1000": [4.35, 50.85] } }))).toThrow(
      /stop/,
    );
  });
});

describe("parseVehicles", () => {
  it("accepts the vehicle list written by the pipeline", () => {
    expect(parseVehicles(VEHICLES)).toEqual(VEHICLES);
  });

  it("rejects a trip without a start", () => {
    const vehicles = [
      { block: "1", trips: [{ route_idx: 0, headsign: "X", end: 10, from_layover: false }] },
    ];
    expect(() => parseVehicles(vehicles)).toThrow(/start/);
  });

  it("rejects a list that is not an array", () => {
    expect(() => parseVehicles({ block: "1" })).toThrow(/array/);
  });
});
