import { describe, expect, it, vi } from "vitest";

import type { Mode, SliceEntry } from "../../src/data/contract";
import { CACHED_HOURS, createSliceStore } from "../../src/data/slices";
import { decodeSlice } from "../../src/data/stv1";
import { encodeSlice } from "../helpers/stv1";

function entry(hour: number, mode: Mode): SliceEntry {
  const name = `${String(hour).padStart(2, "0")}-${mode}`;
  return { hour, mode, path: `slices/${name}.bin`, bytes: 100, vertices: 2, paths: 1 };
}

const ENTRIES = [
  entry(4, "metro"),
  entry(4, "tram"),
  entry(5, "metro"),
  entry(6, "metro"),
  entry(7, "metro"),
  entry(8, "metro"),
];

function fakeLoader() {
  return vi.fn((sliceEntry: SliceEntry) =>
    Promise.resolve(
      decodeSlice(
        encodeSlice(sliceEntry.hour, [
          { lon: [4.35, 4.36], lat: [50.85, 50.86], t: [0, 60], vehicle: 0, trip: 0, route: 0 },
        ]),
      ),
    ),
  );
}

describe("createSliceStore", () => {
  it("mounts exactly the listed slices of an hour, one per mode", async () => {
    const load = fakeLoader();
    const store = createSliceStore(ENTRIES, load);
    const hour = await store.mount(4);
    expect(hour.hour).toBe(4);
    expect([...hour.slices.keys()]).toEqual(["metro", "tram"]);
    expect(hour.slices.get("metro")?.hour).toBe(4);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("never requests a slice the manifest does not list", async () => {
    const load = fakeLoader();
    const store = createSliceStore(ENTRIES, load);
    expect(store.listed(5, "bus")).toBeUndefined();
    expect(store.listed(5, "metro")?.path).toBe("slices/05-metro.bin");
    await store.mount(5);
    expect(load.mock.calls.map((call) => call[0].mode)).toEqual(["metro"]);
  });

  it("mounts an hour without any slice as empty", async () => {
    const store = createSliceStore(ENTRIES, fakeLoader());
    const hour = await store.mount(20);
    expect(hour.slices.size).toBe(0);
  });

  it("serves a second mount from the cache", async () => {
    const load = fakeLoader();
    const store = createSliceStore(ENTRIES, load);
    const first = await store.mount(4);
    const second = await store.mount(4);
    expect(load).toHaveBeenCalledTimes(2);
    expect(second.slices.get("tram")).toBe(first.slices.get("tram"));
    expect(store.cached(4)).toBe(true);
  });

  it("shares an in-flight load between prefetch and mount", async () => {
    const load = fakeLoader();
    const store = createSliceStore(ENTRIES, load);
    store.prefetch(5);
    store.prefetch(5);
    await store.mount(5);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps three hours around the mounted one and evicts the rest", async () => {
    const load = fakeLoader();
    const store = createSliceStore(ENTRIES, load);
    for (const hour of [4, 5, 6, 7]) {
      await store.mount(hour);
    }
    expect(CACHED_HOURS).toBe(3);
    expect(store.cached(4)).toBe(false);
    expect(store.cached(5)).toBe(false);
    expect(store.cached(6)).toBe(true);
    expect(store.cached(7)).toBe(true);
    await store.mount(4);
    expect(load.mock.calls.filter((call) => call[0].hour === 4)).toHaveLength(4);
  });

  it("does not cache a failed load", async () => {
    const load = fakeLoader();
    load.mockRejectedValueOnce(new Error("boom"));
    const store = createSliceStore(ENTRIES, load);
    await expect(store.mount(4)).rejects.toThrow("boom");
    expect(store.cached(4)).toBe(false);
    const hour = await store.mount(4);
    expect(hour.slices.size).toBe(2);
  });
});
