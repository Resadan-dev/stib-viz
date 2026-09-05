/**
 * STV1 binary slices, decoded without copying.
 *
 * Layout (ARCHITECTURE.md, section 5.4), little-endian, offsets 4-byte aligned:
 *
 * - header, 6 × Uint32: magic `STV1`, version, vertex count V, path count P, slice hour, reserved
 * - positions, Float32 × 2V: longitude and latitude interleaved
 * - times, Float32 × V: seconds since 04:00 of the service day
 * - index, Uint32 × (P + 1): first vertex of each path, the last element equal to V
 * - vehicle, Uint32 × P: index into vehicles.json
 * - trip, Uint16 × P: index of the trip within the vehicle
 * - route, Uint16 × P: index into the routes of the manifest
 *
 * Every array is a view on the downloaded buffer, so a slice costs one allocation: the download.
 */

import { FIRST_HOUR, LAST_HOUR } from "../time/clock";

export const STV1_MAGIC = 0x53545631;
export const STV1_VERSION = 1;
export const HEADER_WORDS = 6;
export const HEADER_BYTES = 4 * HEADER_WORDS;

export interface Slice {
  readonly hour: number;
  readonly vertices: number;
  readonly paths: number;
  readonly positions: Float32Array;
  readonly times: Float32Array;
  readonly index: Uint32Array;
  readonly vehicle: Uint32Array;
  readonly trip: Uint16Array;
  readonly route: Uint16Array;
}

export class SliceFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SliceFormatError";
  }
}

/** Size in bytes of a slice holding `vertices` vertices and `paths` paths. */
export function sliceBytes(vertices: number, paths: number): number {
  return HEADER_BYTES + 12 * vertices + 4 * (paths + 1) + 8 * paths;
}

// Typed arrays use the platform byte order; every browser platform is little-endian, but the
// assumption is checked once rather than trusted.
const LITTLE_ENDIAN_PLATFORM = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

export function decodeSlice(buffer: ArrayBuffer): Slice {
  if (!LITTLE_ENDIAN_PLATFORM) {
    throw new SliceFormatError("STV1 slices need a little-endian platform");
  }
  if (buffer.byteLength < HEADER_BYTES) {
    throw new SliceFormatError(`slice too short: ${String(buffer.byteLength)} bytes`);
  }
  const header = new DataView(buffer);
  if (header.getUint32(0, true) !== STV1_MAGIC) {
    throw new SliceFormatError("not an STV1 slice");
  }
  const version = header.getUint32(4, true);
  if (version !== STV1_VERSION) {
    throw new SliceFormatError(`unsupported STV1 version ${String(version)}`);
  }
  const vertices = header.getUint32(8, true);
  const paths = header.getUint32(12, true);
  const hour = header.getUint32(16, true);
  if (hour < FIRST_HOUR || hour > LAST_HOUR) {
    throw new SliceFormatError(`slice hour ${String(hour)} outside the service day`);
  }
  const expected = sliceBytes(vertices, paths);
  if (buffer.byteLength !== expected) {
    throw new SliceFormatError(
      `expected ${String(expected)} bytes for ${String(vertices)} vertices and ${String(paths)} paths, ` +
        `got ${String(buffer.byteLength)}`,
    );
  }

  let offset = HEADER_BYTES;
  const positions = new Float32Array(buffer, offset, 2 * vertices);
  offset += 8 * vertices;
  const times = new Float32Array(buffer, offset, vertices);
  offset += 4 * vertices;
  const index = new Uint32Array(buffer, offset, paths + 1);
  offset += 4 * (paths + 1);
  const vehicle = new Uint32Array(buffer, offset, paths);
  offset += 4 * paths;
  const trip = new Uint16Array(buffer, offset, paths);
  offset += 2 * paths;
  const route = new Uint16Array(buffer, offset, paths);

  if (index[0] !== 0 || index[paths] !== vertices) {
    throw new SliceFormatError("path index does not span the vertex arrays");
  }
  for (let i = 0; i < paths; i += 1) {
    if ((index[i + 1] ?? 0) - (index[i] ?? 0) < 2) {
      throw new SliceFormatError(`path ${String(i)} has fewer than two vertices`);
    }
  }
  return { hour, vertices, paths, positions, times, index, vehicle, trip, route };
}
