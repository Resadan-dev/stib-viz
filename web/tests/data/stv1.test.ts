import { describe, expect, it } from "vitest";

import {
  HEADER_BYTES,
  STV1_MAGIC,
  STV1_VERSION,
  SliceFormatError,
  decodeSlice,
  sliceBytes,
} from "../../src/data/stv1";
import { encodeSlice } from "../helpers/stv1";

const TWO_PATHS = [
  {
    lon: [4.35, 4.36, 4.37],
    lat: [50.85, 50.851, 50.852],
    t: [100, 160, 220],
    vehicle: 7,
    trip: 0,
    route: 2,
  },
  { lon: [4.4, 4.41], lat: [50.8, 50.81], t: [3000, 3090], vehicle: 9, trip: 3, route: 5 },
];

describe("decodeSlice", () => {
  it("reads the header and the arrays of a two-path slice", () => {
    const buffer = encodeSlice(8, TWO_PATHS);
    expect(new DataView(buffer).getUint32(0, true)).toBe(STV1_MAGIC);
    const slice = decodeSlice(buffer);
    expect(slice.hour).toBe(8);
    expect(slice.vertices).toBe(5);
    expect(slice.paths).toBe(2);
    expect(Array.from(slice.index)).toEqual([0, 3, 5]);
    expect(Array.from(slice.times)).toEqual([100, 160, 220, 3000, 3090]);
    expect(slice.positions[0]).toBeCloseTo(4.35, 5);
    expect(slice.positions[1]).toBeCloseTo(50.85, 4);
    expect(Array.from(slice.vehicle)).toEqual([7, 9]);
    expect(Array.from(slice.trip)).toEqual([0, 3]);
    expect(Array.from(slice.route)).toEqual([2, 5]);
  });

  it("views the file buffer instead of copying it", () => {
    const buffer = encodeSlice(8, TWO_PATHS);
    const slice = decodeSlice(buffer);
    for (const array of [
      slice.positions,
      slice.times,
      slice.index,
      slice.vehicle,
      slice.trip,
      slice.route,
    ]) {
      expect(array.buffer).toBe(buffer);
    }
  });

  it("sizes the file as the pipeline does", () => {
    expect(sliceBytes(5, 2)).toBe(HEADER_BYTES + 12 * 5 + 4 * 3 + 8 * 2);
    expect(encodeSlice(8, TWO_PATHS).byteLength).toBe(sliceBytes(5, 2));
  });

  it("accepts an empty slice", () => {
    const slice = decodeSlice(encodeSlice(4, []));
    expect(slice.paths).toBe(0);
    expect(Array.from(slice.index)).toEqual([0]);
  });

  it("rejects a file that is not STV1", () => {
    expect(() => decodeSlice(encodeSlice(8, TWO_PATHS, { magic: 0x12345678 }))).toThrow(
      SliceFormatError,
    );
    expect(() => decodeSlice(new ArrayBuffer(3))).toThrow(/too short/);
  });

  it("rejects an unknown version", () => {
    expect(() => decodeSlice(encodeSlice(8, TWO_PATHS, { version: STV1_VERSION + 1 }))).toThrow(
      /version/,
    );
  });

  it("rejects a truncated file", () => {
    const full = encodeSlice(8, TWO_PATHS);
    expect(() => decodeSlice(full.slice(0, full.byteLength - 4))).toThrow(/bytes/);
  });

  it("rejects an index that does not close on the vertex count", () => {
    const buffer = encodeSlice(8, TWO_PATHS);
    new DataView(buffer).setUint32(HEADER_BYTES + 12 * 5 + 8, 4, true);
    expect(() => decodeSlice(buffer)).toThrow(/index/);
  });

  it("rejects a path with a single vertex", () => {
    const single = [{ lon: [4.35], lat: [50.85], t: [100], vehicle: 0, trip: 0, route: 0 }];
    expect(() => decodeSlice(encodeSlice(8, single))).toThrow(/two vertices/);
  });

  it("rejects an hour outside the service day", () => {
    expect(() => decodeSlice(encodeSlice(28, TWO_PATHS))).toThrow(/hour/);
  });
});
