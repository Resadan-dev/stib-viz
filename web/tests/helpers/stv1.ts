/** Builds STV1 slice files in memory, mirroring the layout the pipeline writes. */

import { HEADER_BYTES, STV1_MAGIC, STV1_VERSION, sliceBytes } from "../../src/data/stv1";

export interface PathSpec {
  lon: number[];
  lat: number[];
  t: number[];
  vehicle: number;
  trip: number;
  route: number;
}

export interface EncodeOptions {
  magic?: number;
  version?: number;
}

export function encodeSlice(
  hour: number,
  paths: PathSpec[],
  options: EncodeOptions = {},
): ArrayBuffer {
  const vertices = paths.reduce((total, path) => total + path.t.length, 0);
  const buffer = new ArrayBuffer(sliceBytes(vertices, paths.length));
  const header = new DataView(buffer);
  header.setUint32(0, options.magic ?? STV1_MAGIC, true);
  header.setUint32(4, options.version ?? STV1_VERSION, true);
  header.setUint32(8, vertices, true);
  header.setUint32(12, paths.length, true);
  header.setUint32(16, hour, true);
  header.setUint32(20, 0, true);

  let offset = HEADER_BYTES;
  const positions = new Float32Array(buffer, offset, 2 * vertices);
  offset += 8 * vertices;
  const times = new Float32Array(buffer, offset, vertices);
  offset += 4 * vertices;
  const index = new Uint32Array(buffer, offset, paths.length + 1);
  offset += 4 * (paths.length + 1);
  const vehicle = new Uint32Array(buffer, offset, paths.length);
  offset += 4 * paths.length;
  const trip = new Uint16Array(buffer, offset, paths.length);
  offset += 2 * paths.length;
  const route = new Uint16Array(buffer, offset, paths.length);

  let cursor = 0;
  paths.forEach((path, i) => {
    index[i] = cursor;
    path.t.forEach((time, k) => {
      positions[2 * (cursor + k)] = path.lon[k] ?? Number.NaN;
      positions[2 * (cursor + k) + 1] = path.lat[k] ?? Number.NaN;
      times[cursor + k] = time;
    });
    vehicle[i] = path.vehicle;
    trip[i] = path.trip;
    route[i] = path.route;
    cursor += path.t.length;
  });
  index[paths.length] = cursor;
  return buffer;
}
