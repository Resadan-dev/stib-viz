import { describe, expect, it, vi } from "vitest";

import { DataError, type StopsFileEntry } from "../../src/data/contract";
import {
  createStopsStore,
  parseStops,
  type StopsFile,
  type StopsLoader,
} from "../../src/data/stops";

const ENTRIES: StopsFileEntry[] = [
  { hour: 8, path: "stops/08.json", bytes: 100 },
  { hour: 9, path: "stops/09.json", bytes: 100 },
];

const FILE: StopsFile = {
  "0:1": [
    [14400, "1000"],
    [14520, "2788"],
  ],
};

describe("parseStops", () => {
  it("accepts the file written by the pipeline", () => {
    expect(parseStops(FILE)).toEqual(FILE);
  });

  it("rejects anything but lists of [seconds, stop id]", () => {
    expect(() => parseStops([])).toThrow(DataError);
    expect(() => parseStops({ "0:1": [[14400]] })).toThrow(/0:1/);
    expect(() => parseStops({ "0:1": [["x", "1000"]] })).toThrow(/0:1/);
  });
});

describe("createStopsStore", () => {
  it("loads a listed hour once and answers null for an unlisted one", async () => {
    const load = vi.fn<StopsLoader>(() => Promise.resolve(FILE));
    const store = createStopsStore(ENTRIES, load);
    expect(await store.get(8)).toEqual(FILE);
    expect(await store.get(8)).toEqual(FILE);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0]?.[0]).toEqual(ENTRIES[0]);
    expect(await store.get(20)).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed load", async () => {
    const load = vi.fn<StopsLoader>(() => Promise.resolve(FILE));
    load.mockRejectedValueOnce(new Error("boom"));
    const store = createStopsStore(ENTRIES, load);
    await expect(store.get(9)).rejects.toThrow("boom");
    expect(await store.get(9)).toEqual(FILE);
  });
});
