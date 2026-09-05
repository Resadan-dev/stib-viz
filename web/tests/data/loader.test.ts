import { describe, expect, it, vi } from "vitest";

import { DataError } from "../../src/data/contract";
import {
  createDataSource,
  dayDirectory,
  loadDay,
  loadIndex,
  loadNetwork,
  loadSlice,
  loadVehicles,
} from "../../src/data/loader";
import { INDEX, MANIFEST, NETWORK, VEHICLES } from "../helpers/fixtures";
import { encodeSlice } from "../helpers/stv1";

type Files = Record<string, unknown>;

function fakeFetch(files: Files) {
  return vi.fn((input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const body = files[url];
    if (body === undefined) {
      return Promise.resolve(new Response("not found", { status: 404 }));
    }
    if (body instanceof ArrayBuffer) {
      return Promise.resolve(new Response(body, { status: 200 }));
    }
    if (typeof body === "string") {
      return Promise.resolve(new Response(body, { status: 200 }));
    }
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  });
}

const SLICE = encodeSlice(8, [
  { lon: [4.35, 4.36], lat: [50.85, 50.86], t: [14400, 14460], vehicle: 0, trip: 0, route: 0 },
]);

const FILES: Files = {
  "/data/index.json": INDEX,
  "/data/2026-09-09/manifest.json": MANIFEST,
  "/data/network/2_20_20260831_010702.json": NETWORK,
  "/data/2026-09-09/vehicles.json": VEHICLES,
  "/data/2026-09-09/slices/08-metro.bin": SLICE,
  "/data/broken.json": "{",
};

describe("createDataSource", () => {
  it("joins the base and the relative path", async () => {
    const fetchFn = fakeFetch(FILES);
    const source = createDataSource("/data", fetchFn);
    await source.json("index.json");
    expect(fetchFn).toHaveBeenCalledWith("/data/index.json");
  });

  it("tolerates a base with a trailing slash", async () => {
    const fetchFn = fakeFetch(FILES);
    await createDataSource("/data/", fetchFn).json("index.json");
    expect(fetchFn).toHaveBeenCalledWith("/data/index.json");
  });

  it("reports the path and the status of a failed request", async () => {
    const source = createDataSource("/data", fakeFetch(FILES));
    await expect(source.json("missing.json")).rejects.toThrow(DataError);
    await expect(source.json("missing.json")).rejects.toThrow(/missing\.json.*404/);
    await expect(source.binary("missing.bin")).rejects.toThrow(/missing\.bin.*404/);
  });

  it("reports a body that is not JSON", async () => {
    const source = createDataSource("/data", fakeFetch(FILES));
    await expect(source.json("broken.json")).rejects.toThrow(/broken\.json.*JSON/);
  });
});

describe("loading a day", () => {
  it("derives the day directory from the manifest path", () => {
    expect(dayDirectory("2026-09-09/manifest.json")).toBe("2026-09-09/");
    expect(dayDirectory("manifest.json")).toBe("");
  });

  it("loads the index, the manifest, the network, the vehicles and a decoded slice", async () => {
    const source = createDataSource("/data", fakeFetch(FILES));
    const index = await loadIndex(source);
    const entry = index.days[0];
    if (entry === undefined) {
      throw new Error("the index fixture lists no day");
    }
    const day = await loadDay(source, entry);
    expect(day.directory).toBe("2026-09-09/");
    expect(day.manifest.date).toBe("2026-09-09");
    expect(day.entry).toBe(entry);

    const network = await loadNetwork(source, day);
    expect(network.features).toHaveLength(2);
    const vehicles = await loadVehicles(source, day);
    expect(vehicles).toHaveLength(2);

    const sliceEntry = day.manifest.slices[0];
    if (sliceEntry === undefined) {
      throw new Error("the manifest fixture lists no slice");
    }
    const slice = await loadSlice(source, day, sliceEntry);
    expect(slice.hour).toBe(8);
    expect(slice.paths).toBe(1);
  });

  it("rejects a manifest that does not describe the requested day", async () => {
    const files = { ...FILES, "/data/2026-09-11/manifest.json": MANIFEST };
    const source = createDataSource("/data", fakeFetch(files));
    const entry = {
      date: "2026-09-11",
      kind: "weekday",
      source: "schedule",
      manifest: "2026-09-11/manifest.json",
    };
    await expect(loadDay(source, entry)).rejects.toThrow(/2026-09-11/);
  });
});
