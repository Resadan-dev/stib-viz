/**
 * What the vehicle panel says about the selected vehicle (SCOPE.md, section 4.4): its route,
 * destination, next stop and scheduled time, from vehicles.json and the stops of the hour.
 */

import type { Network, RouteInfo, Vehicle } from "../data/contract";
import type { StopsFile } from "../data/stops";
import type { HeadBuffers, MountedSlice } from "./heads";

export type VehicleStatus = "running" | "layover" | "off";

export interface VehicleDescription {
  status: VehicleStatus;
  block: string;
  route: RouteInfo | null;
  headsign: string | null;
  tripIndex: number | null;
  start: number | null;
  end: number | null;
  nextStop: { name: string; time: number } | null;
}

/** Index of the trip under way at `time`, or null between trips. */
export function currentTrip(vehicle: Vehicle, time: number): number | null {
  const index = vehicle.trips.findIndex((trip) => trip.start <= time && time <= trip.end);
  return index < 0 ? null : index;
}

function nextStopOf(
  key: string,
  time: number,
  stops: StopsFile | null,
  names: Network["stops"],
): VehicleDescription["nextStop"] {
  const next = stops?.[key]?.find(([at]) => at > time);
  if (next === undefined) {
    return null;
  }
  const [at, stopId] = next;
  return { name: names[stopId]?.[2] ?? stopId, time: at };
}

export function describeVehicle(
  index: number,
  vehicles: readonly Vehicle[],
  routes: readonly RouteInfo[],
  time: number,
  stops: StopsFile | null,
  names: Network["stops"],
): VehicleDescription | null {
  const vehicle = vehicles[index];
  if (vehicle === undefined) {
    return null;
  }
  const running = currentTrip(vehicle, time);
  if (running !== null) {
    const trip = vehicle.trips[running];
    if (trip === undefined) {
      return null;
    }
    return {
      status: "running",
      block: vehicle.block,
      route: routes[trip.route_idx] ?? null,
      headsign: trip.headsign,
      tripIndex: running,
      start: trip.start,
      end: trip.end,
      nextStop: nextStopOf(`${String(index)}:${String(running)}`, time, stops, names),
    };
  }
  const nextIndex = vehicle.trips.findIndex((trip) => trip.start > time);
  const next = nextIndex < 0 ? undefined : vehicle.trips[nextIndex];
  const previous = nextIndex > 0 ? vehicle.trips[nextIndex - 1] : undefined;
  if (next !== undefined && next.from_layover && previous !== undefined && previous.end <= time) {
    return {
      status: "layover",
      block: vehicle.block,
      route: routes[next.route_idx] ?? null,
      headsign: next.headsign,
      tripIndex: nextIndex,
      start: next.start,
      end: next.end,
      nextStop: null,
    };
  }
  return {
    status: "off",
    block: vehicle.block,
    route: null,
    headsign: null,
    tripIndex: null,
    start: null,
    end: null,
    nextStop: null,
  };
}

/** Distinct vehicles with a drawn head on the named line, ascending, for stepping through them. */
export function vehiclesOnLine(
  mounted: readonly MountedSlice[],
  buffers: HeadBuffers,
  count: number,
  routes: readonly RouteInfo[],
  line: string,
): number[] {
  const found = new Set<number>();
  for (let i = 0; i < count; i += 1) {
    const entry = mounted[buffers.slot[i] ?? -1];
    const path = buffers.path[i];
    if (entry === undefined || path === undefined) {
      continue;
    }
    const route = routes[entry.slice.route[path] ?? -1];
    const vehicle = entry.slice.vehicle[path];
    if (route?.name === line && vehicle !== undefined) {
      found.add(vehicle);
    }
  }
  return [...found].sort((a, b) => a - b);
}

/** The next or previous vehicle of the list, cyclically; from outside the list, its first or last. */
export function stepVehicle(
  list: readonly number[],
  current: number | null,
  direction: 1 | -1,
): number | null {
  if (list.length === 0) {
    return null;
  }
  const at = current === null ? -1 : list.indexOf(current);
  if (at < 0) {
    return direction === 1 ? (list[0] ?? null) : (list[list.length - 1] ?? null);
  }
  return list[(at + direction + list.length) % list.length] ?? null;
}

/** The vehicle and trip behind a picked head, from the buffers the heads were drawn from. */
export function headAt(
  mounted: readonly MountedSlice[],
  buffers: HeadBuffers,
  index: number,
): { vehicle: number; trip: number } | undefined {
  if (index < 0 || index >= buffers.capacity) {
    return undefined;
  }
  const entry = mounted[buffers.slot[index] ?? -1];
  const path = buffers.path[index];
  if (entry === undefined || path === undefined) {
    return undefined;
  }
  const vehicle = entry.slice.vehicle[path];
  const trip = entry.slice.trip[path];
  return vehicle === undefined || trip === undefined ? undefined : { vehicle, trip };
}
