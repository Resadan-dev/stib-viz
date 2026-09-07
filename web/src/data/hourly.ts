/**
 * The scheduled speed of every segment, hour by hour of the service day (ARCHITECTURE.md,
 * section 5.8).
 *
 * A file of its own rather than a field of the network layer: twenty-four numbers per segment is
 * more than the first frame should carry, and only the speed view of the network ever reads
 * them, so it is fetched the first time that view is turned on and never before. It is keyed by
 * the segment rather than by its position in the network file, so nothing depends on two files
 * agreeing on an order.
 */

import { DataError, type NetworkProperties } from "./contract";
import type { DataSource, Day } from "./loader";

/** The file as the pipeline writes it: speeds in tenths of a km/h, 0 for an hour it cannot time. */
export interface HourlySpeedsFile {
  feed_version: string;
  /** The hour of the service day the first value of every row stands for; 4 is 04:00. */
  first_hour: number;
  hours: number;
  /** Runs an hour needed before the timetable was taken to say anything about it. */
  min_runs: number;
  speeds: Record<string, number[]>;
}

export interface HourlySpeeds {
  /** km/h over the segment during that hour of the service day, or null when the day is silent. */
  at(segment: string, hour: number): number | null;
}

/** How a segment is named in the file: its mode and the two stops it joins. */
export function segmentKey(properties: Pick<NetworkProperties, "mode" | "from" | "to">): string {
  return `${properties.mode}|${properties.from}|${properties.to}`;
}

export function parseHourlySpeeds(value: unknown): HourlySpeeds {
  const where = "hourly speeds";
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DataError(`${where}: expected an object`);
  }
  const fields = value as Record<string, unknown>;
  const firstHour = fields.first_hour;
  const hours = fields.hours;
  if (typeof firstHour !== "number" || typeof hours !== "number" || hours < 1) {
    throw new DataError(`${where}: missing or invalid first_hour and hours`);
  }
  const speeds = fields.speeds;
  if (typeof speeds !== "object" || speeds === null || Array.isArray(speeds)) {
    throw new DataError(`${where}: speeds must be an object keyed by segment`);
  }
  const rows = new Map<string, number[]>();
  for (const [segment, row] of Object.entries(speeds as Record<string, unknown>)) {
    if (!Array.isArray(row) || row.length !== hours) {
      throw new DataError(`${where}: ${segment} must hold ${String(hours)} values`);
    }
    if (!row.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
      throw new DataError(`${where}: ${segment} holds something that is not a number`);
    }
    rows.set(segment, row as number[]);
  }
  return {
    at(segment, hour) {
      const tenths = rows.get(segment)?.[hour - firstHour] ?? 0;
      // Zero is how the file says the timetable runs too few times that hour to be timed.
      return tenths > 0 ? tenths / 10 : null;
    },
  };
}

export async function loadHourlySpeeds(source: DataSource, day: Day): Promise<HourlySpeeds | null> {
  const path = day.manifest.network_hourly;
  if (path === null) {
    return null;
  }
  return parseHourlySpeeds(await source.json(path));
}
