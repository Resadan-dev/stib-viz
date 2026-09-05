/**
 * Current vehicle positions, the "heads" of the trails (ARCHITECTURE.md, section 6.3).
 *
 * Each frame, every path of the mounted slices is tested against the current instant; an
 * active path yields a position by binary search in its time array followed by interpolation.
 * A vehicle in layover keeps the end position of its last trip: between two of its paths when
 * they meet at the same terminus, and before or after them when the trip list says the vehicle
 * waited there. Everything is written into preallocated buffers: no allocation per frame.
 */

import type { Mode, RouteInfo, Vehicle } from "../data/contract";
import type { Slice } from "../data/stv1";
import { pathColors, vertexColors, type ColourOptions } from "./colors";

/** Two path ends closer than this are the same terminus: a layover, not a deadhead move. */
export const LAYOVER_MAX_M = 100;
const METRES_PER_DEGREE = 111_195;

export interface VehiclePaths {
  vehicle: number;
  /** Path indices of the vehicle in the slice, in time order. */
  paths: number[];
}

/** A slice ready to draw: colours unfolded and paths grouped by vehicle. */
export interface MountedSlice {
  mode: Mode;
  slice: Slice;
  vertexColors: Uint8Array;
  pathColors: Uint8Array;
  byVehicle: VehiclePaths[];
}

export interface HeadBuffers {
  capacity: number;
  /** Longitude and latitude interleaved. */
  positions: Float32Array;
  /** RGBA per head. */
  colors: Uint8Array;
  /** Index of the mounted slice each head comes from. */
  slot: Uint16Array;
  /** Index of the path each head comes from, within its slice. */
  path: Uint32Array;
}

export function distanceM(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const midLatitude = (((lat1 + lat2) / 2) * Math.PI) / 180;
  const dx = (lon2 - lon1) * Math.cos(midLatitude) * METRES_PER_DEGREE;
  const dy = (lat2 - lat1) * METRES_PER_DEGREE;
  return Math.hypot(dx, dy);
}

function firstVertex(slice: Slice, path: number): number {
  return slice.index[path] ?? 0;
}

function lastVertex(slice: Slice, path: number): number {
  return (slice.index[path + 1] ?? 1) - 1;
}

function startTime(slice: Slice, path: number): number {
  return slice.times[firstVertex(slice, path)] ?? 0;
}

function endTime(slice: Slice, path: number): number {
  return slice.times[lastVertex(slice, path)] ?? 0;
}

export function indexByVehicle(slice: Slice): VehiclePaths[] {
  const groups = new Map<number, number[]>();
  for (let path = 0; path < slice.paths; path += 1) {
    const vehicle = slice.vehicle[path] ?? 0;
    const list = groups.get(vehicle) ?? [];
    list.push(path);
    groups.set(vehicle, list);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([vehicle, paths]) => ({
      vehicle,
      paths: paths.sort((a, b) => startTime(slice, a) - startTime(slice, b)),
    }));
}

export function mountSlice(
  mode: Mode,
  slice: Slice,
  routes: readonly RouteInfo[],
  options: ColourOptions = {},
): MountedSlice {
  return {
    mode,
    slice,
    vertexColors: vertexColors(slice, routes, options),
    pathColors: pathColors(slice, routes, options),
    byVehicle: indexByVehicle(slice),
  };
}

/** The same slice with new colours: geometry and vehicle grouping are shared, not recomputed. */
export function recolour(
  mounted: MountedSlice,
  routes: readonly RouteInfo[],
  options: ColourOptions,
): MountedSlice {
  return {
    ...mounted,
    vertexColors: vertexColors(mounted.slice, routes, options),
    pathColors: pathColors(mounted.slice, routes, options),
  };
}

export function createHeadBuffers(capacity: number): HeadBuffers {
  return {
    capacity,
    positions: new Float32Array(2 * capacity),
    colors: new Uint8Array(4 * capacity),
    slot: new Uint16Array(capacity),
    path: new Uint32Array(capacity),
  };
}

/** Writes the position of a path at instant `t` into `out[offset]`, `out[offset + 1]`. */
export function positionAt(
  slice: Slice,
  path: number,
  t: number,
  out: Float32Array,
  offset: number,
): void {
  const { times, positions } = slice;
  let low = firstVertex(slice, path);
  let high = lastVertex(slice, path);
  if (t <= (times[low] ?? 0)) {
    high = low;
  } else if (t >= (times[high] ?? 0)) {
    low = high;
  } else {
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if ((times[middle] ?? 0) <= t) {
        low = middle;
      } else {
        high = middle;
      }
    }
  }
  const t0 = times[low] ?? 0;
  const t1 = times[high] ?? 0;
  const fraction = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
  const lon0 = positions[2 * low] ?? 0;
  const lat0 = positions[2 * low + 1] ?? 0;
  out[offset] = lon0 + ((positions[2 * high] ?? 0) - lon0) * fraction;
  out[offset + 1] = lat0 + ((positions[2 * high + 1] ?? 0) - lat0) * fraction;
}

function sameTerminus(slice: Slice, vertexA: number, vertexB: number): boolean {
  const { positions } = slice;
  return (
    distanceM(
      positions[2 * vertexA] ?? 0,
      positions[2 * vertexA + 1] ?? 0,
      positions[2 * vertexB] ?? 0,
      positions[2 * vertexB + 1] ?? 0,
    ) <= LAYOVER_MAX_M
  );
}

type Emit = (path: number, vertex: number | undefined) => void;

/**
 * Places one vehicle: on the path it runs, or held at a terminus during a layover.
 * `vertex` is undefined when the position must be interpolated at `t`.
 */
function placeVehicle(
  slice: Slice,
  group: VehiclePaths,
  t: number,
  vehicles: readonly Vehicle[] | null,
  emit: Emit,
): void {
  const { paths } = group;
  for (const path of paths) {
    if (t >= startTime(slice, path) && t <= endTime(slice, path)) {
      emit(path, undefined);
      return;
    }
  }
  for (let i = 0; i + 1 < paths.length; i += 1) {
    const before = paths[i] ?? 0;
    const after = paths[i + 1] ?? 0;
    if (t > endTime(slice, before) && t < startTime(slice, after)) {
      if (sameTerminus(slice, lastVertex(slice, before), firstVertex(slice, after))) {
        emit(before, lastVertex(slice, before));
      }
      return;
    }
  }
  const vehicle = vehicles?.[group.vehicle];
  const first = paths[0];
  const last = paths[paths.length - 1];
  if (vehicle === undefined || first === undefined || last === undefined) {
    return;
  }
  if (t < startTime(slice, first)) {
    const tripIndex = slice.trip[first] ?? 0;
    const trip = vehicle.trips[tripIndex];
    const previous = tripIndex > 0 ? vehicle.trips[tripIndex - 1] : undefined;
    if (trip?.from_layover === true && previous !== undefined && previous.end <= t) {
      emit(first, firstVertex(slice, first));
    }
    return;
  }
  if (t > endTime(slice, last)) {
    const next = vehicle.trips[(slice.trip[last] ?? 0) + 1];
    if (next?.from_layover === true && t < next.start) {
      emit(last, lastVertex(slice, last));
    }
  }
}

/** Fills `out` with the heads of every mounted slice at instant `t` and returns their count. */
export function computeHeads(
  mounted: readonly MountedSlice[],
  t: number,
  vehicles: readonly Vehicle[] | null,
  out: HeadBuffers,
): number {
  let count = 0;
  mounted.forEach((entry, slot) => {
    const { slice } = entry;
    const emit: Emit = (path, vertex) => {
      if (count >= out.capacity) {
        throw new RangeError(`head buffers hold ${String(out.capacity)} heads, more are needed`);
      }
      if (vertex === undefined) {
        positionAt(slice, path, t, out.positions, 2 * count);
      } else {
        out.positions[2 * count] = slice.positions[2 * vertex] ?? 0;
        out.positions[2 * count + 1] = slice.positions[2 * vertex + 1] ?? 0;
      }
      out.colors.set(entry.pathColors.subarray(4 * path, 4 * path + 4), 4 * count);
      out.slot[count] = slot;
      out.path[count] = path;
      count += 1;
    };
    for (const group of entry.byVehicle) {
      placeVehicle(slice, group, t, vehicles, emit);
    }
  });
  return count;
}
