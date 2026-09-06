/**
 * The data contract between the pipeline and the site (ARCHITECTURE.md, section 5): types for
 * the JSON files and parsers that validate them at the boundary.
 *
 * The files are produced by our own pipeline, but they arrive over the network like any other
 * input: each parser checks the fields the site relies on and fails with a message naming the
 * offending field, rather than letting an undefined value surface deep in the renderer.
 */

export const MODES = ["metro", "tram", "bus", "noctis"] as const;
export type Mode = (typeof MODES)[number];

export const MINUTES_PER_DAY = 1440;

export interface DayIndexEntry {
  date: string;
  kind: string;
  source: string;
  manifest: string;
}

export interface DayIndex {
  generated_at: string;
  feed_version: string;
  feed_valid_from: string;
  feed_valid_to: string;
  service_day_start: string;
  days: DayIndexEntry[];
}

export interface RouteInfo {
  id: string;
  name: string;
  mode: Mode;
  color: string;
  text_color: string;
  long_name: string;
}

export interface SliceEntry {
  hour: number;
  mode: Mode;
  path: string;
  bytes: number;
  vertices: number;
  paths: number;
}

export interface StopsFileEntry {
  hour: number;
  path: string;
  bytes: number;
}

export type PerMinute = Record<Mode, number[]>;

export interface Manifest {
  date: string;
  source: string;
  feed_version: string;
  attribution: string;
  network: string;
  service_day_start_s: number;
  totals: { trips: number; vehicles: number; km: number };
  peak: { vehicles: number; minute: number };
  per_minute: { vehicles: PerMinute; departures: PerMinute; km: PerMinute };
  routes: RouteInfo[];
  vehicles_file: string;
  vehicle_count: number;
  slices: SliceEntry[];
  stops_files: StopsFileEntry[];
  anomalies: Record<string, number>;
}

export interface NetworkProperties {
  mode: Mode;
  from: string;
  to: string;
  runs: number;
  class: number;
  underground: boolean;
  /**
   * Scheduled speed over the segment across the day, in km/h; null when no run of the day could
   * time it. Absent from network files written before format v2, which read as unknown.
   */
  speed: number | null;
}

export interface NetworkFeature {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: [number, number][] };
  properties: NetworkProperties;
}

/** Longitude, latitude and French name of a stop. */
export type StopEntry = [number, number, string];

export interface Network {
  type: "FeatureCollection";
  feed_version: string;
  intensity_breaks: number[];
  features: NetworkFeature[];
  stops: Record<string, StopEntry>;
}

export interface VehicleTrip {
  route_idx: number;
  headsign: string;
  start: number;
  end: number;
  from_layover: boolean;
}

export interface Vehicle {
  block: string;
  trips: VehicleTrip[];
}

export class DataError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DataError";
  }
}

type Fields = Record<string, unknown>;

function object(value: unknown, where: string): Fields {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DataError(`${where}: expected an object`);
  }
  return value as Fields;
}

function array(fields: Fields, key: string, where: string): unknown[] {
  const value = fields[key];
  if (!Array.isArray(value)) {
    throw new DataError(`${where}: missing or invalid ${key} (expected an array)`);
  }
  return value;
}

function string(fields: Fields, key: string, where: string): string {
  const value = fields[key];
  if (typeof value !== "string") {
    throw new DataError(`${where}: missing or invalid ${key}`);
  }
  return value;
}

function number(fields: Fields, key: string, where: string): number {
  const value = fields[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DataError(`${where}: missing or invalid ${key}`);
  }
  return value;
}

/** A finite number, or null when the field is null or absent: for a value a file may not carry. */
function nullableNumber(fields: Fields, key: string, where: string): number | null {
  const value = fields[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DataError(`${where}: invalid ${key}`);
  }
  return value;
}

function boolean(fields: Fields, key: string, where: string): boolean {
  const value = fields[key];
  if (typeof value !== "boolean") {
    throw new DataError(`${where}: missing or invalid ${key}`);
  }
  return value;
}

function mode(fields: Fields, key: string, where: string): Mode {
  const value = string(fields, key, where);
  if (!(MODES as readonly string[]).includes(value)) {
    throw new DataError(`${where}: unknown mode ${value}`);
  }
  return value as Mode;
}

function numberList(value: unknown, where: string): number[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "number")) {
    throw new DataError(`${where}: expected a list of numbers`);
  }
  return value;
}

export function parseIndex(value: unknown): DayIndex {
  const fields = object(value, "index");
  return {
    generated_at: string(fields, "generated_at", "index"),
    feed_version: string(fields, "feed_version", "index"),
    feed_valid_from: string(fields, "feed_valid_from", "index"),
    feed_valid_to: string(fields, "feed_valid_to", "index"),
    service_day_start: string(fields, "service_day_start", "index"),
    days: array(fields, "days", "index").map((item, i) => {
      const where = `index: days[${String(i)}]`;
      const day = object(item, where);
      return {
        date: string(day, "date", where),
        kind: string(day, "kind", where),
        source: string(day, "source", where),
        manifest: string(day, "manifest", where),
      };
    }),
  };
}

function parseRoute(item: unknown, where: string): RouteInfo {
  const route = object(item, where);
  return {
    id: string(route, "id", where),
    name: string(route, "name", where),
    mode: mode(route, "mode", where),
    color: string(route, "color", where),
    text_color: string(route, "text_color", where),
    long_name: string(route, "long_name", where),
  };
}

function parseSliceEntry(item: unknown, where: string): SliceEntry {
  const entry = object(item, where);
  return {
    hour: number(entry, "hour", where),
    mode: mode(entry, "mode", where),
    path: string(entry, "path", where),
    bytes: number(entry, "bytes", where),
    vertices: number(entry, "vertices", where),
    paths: number(entry, "paths", where),
  };
}

function parsePerMinute(value: unknown, where: string): PerMinute {
  const series = object(value, where);
  const result = {} as PerMinute;
  for (const key of MODES) {
    const values = numberList(series[key], `${where}.${key}`);
    if (values.length !== MINUTES_PER_DAY) {
      throw new DataError(`${where}.${key}: expected ${String(MINUTES_PER_DAY)} values`);
    }
    result[key] = values;
  }
  return result;
}

function parseAnomalies(value: unknown, where: string): Record<string, number> {
  const fields = object(value, where);
  const anomalies: Record<string, number> = {};
  for (const key of Object.keys(fields)) {
    anomalies[key] = number(fields, key, where);
  }
  return anomalies;
}

export function parseManifest(value: unknown): Manifest {
  const where = "manifest";
  const fields = object(value, where);
  const totals = object(fields.totals, `${where}: totals`);
  const peak = object(fields.peak, `${where}: peak`);
  const perMinute = object(fields.per_minute, `${where}: per_minute`);
  return {
    date: string(fields, "date", where),
    source: string(fields, "source", where),
    feed_version: string(fields, "feed_version", where),
    attribution: string(fields, "attribution", where),
    network: string(fields, "network", where),
    service_day_start_s: number(fields, "service_day_start_s", where),
    totals: {
      trips: number(totals, "trips", `${where}: totals`),
      vehicles: number(totals, "vehicles", `${where}: totals`),
      km: number(totals, "km", `${where}: totals`),
    },
    peak: {
      vehicles: number(peak, "vehicles", `${where}: peak`),
      minute: number(peak, "minute", `${where}: peak`),
    },
    per_minute: {
      vehicles: parsePerMinute(perMinute.vehicles, `${where}: per_minute.vehicles`),
      departures: parsePerMinute(perMinute.departures, `${where}: per_minute.departures`),
      km: parsePerMinute(perMinute.km, `${where}: per_minute.km`),
    },
    routes: array(fields, "routes", where).map((item, i) =>
      parseRoute(item, `${where}: routes[${String(i)}]`),
    ),
    vehicles_file: string(fields, "vehicles_file", where),
    vehicle_count: number(fields, "vehicle_count", where),
    slices: array(fields, "slices", where).map((item, i) =>
      parseSliceEntry(item, `${where}: slices[${String(i)}]`),
    ),
    stops_files: array(fields, "stops_files", where).map((item, i) => {
      const entryWhere = `${where}: stops_files[${String(i)}]`;
      const entry = object(item, entryWhere);
      return {
        hour: number(entry, "hour", entryWhere),
        path: string(entry, "path", entryWhere),
        bytes: number(entry, "bytes", entryWhere),
      };
    }),
    anomalies: parseAnomalies(fields.anomalies, `${where}: anomalies`),
  };
}

function parseFeature(item: unknown, where: string): NetworkFeature {
  const feature = object(item, where);
  const geometry = object(feature.geometry, `${where}: geometry`);
  if (geometry.type !== "LineString") {
    throw new DataError(`${where}: expected a LineString geometry`);
  }
  const coordinates = array(geometry, "coordinates", `${where}: geometry`).map((point, i) => {
    const pair = numberList(point, `${where}: coordinates[${String(i)}]`);
    if (pair.length !== 2) {
      throw new DataError(`${where}: coordinates[${String(i)}] must be [lon, lat]`);
    }
    return [pair[0] ?? 0, pair[1] ?? 0] as [number, number];
  });
  const properties = object(feature.properties, `${where}: properties`);
  const propertiesWhere = `${where}: properties`;
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates },
    properties: {
      mode: mode(properties, "mode", propertiesWhere),
      from: string(properties, "from", propertiesWhere),
      to: string(properties, "to", propertiesWhere),
      runs: number(properties, "runs", propertiesWhere),
      class: number(properties, "class", propertiesWhere),
      underground: boolean(properties, "underground", propertiesWhere),
      speed: nullableNumber(properties, "speed", propertiesWhere),
    },
  };
}

export function parseNetwork(value: unknown): Network {
  const where = "network";
  const fields = object(value, where);
  if (fields.type !== "FeatureCollection") {
    throw new DataError(`${where}: expected a FeatureCollection`);
  }
  const stopsFields = object(fields.stops, `${where}: stops`);
  const stops: Record<string, StopEntry> = {};
  for (const [id, entry] of Object.entries(stopsFields)) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 3 ||
      typeof entry[0] !== "number" ||
      typeof entry[1] !== "number" ||
      typeof entry[2] !== "string"
    ) {
      throw new DataError(`${where}: stop ${id} must be [lon, lat, name]`);
    }
    stops[id] = [entry[0], entry[1], entry[2]];
  }
  return {
    type: "FeatureCollection",
    feed_version: string(fields, "feed_version", where),
    intensity_breaks: numberList(fields.intensity_breaks, `${where}: intensity_breaks`),
    features: array(fields, "features", where).map((item, i) =>
      parseFeature(item, `${where}: features[${String(i)}]`),
    ),
    stops,
  };
}

export function parseVehicles(value: unknown): Vehicle[] {
  if (!Array.isArray(value)) {
    throw new DataError("vehicles: expected an array");
  }
  return value.map((item, i) => {
    const where = `vehicles[${String(i)}]`;
    const vehicle = object(item, where);
    return {
      block: string(vehicle, "block", where),
      trips: array(vehicle, "trips", where).map((tripItem, k) => {
        const tripWhere = `${where}: trips[${String(k)}]`;
        const trip = object(tripItem, tripWhere);
        return {
          route_idx: number(trip, "route_idx", tripWhere),
          headsign: string(trip, "headsign", tripWhere),
          start: number(trip, "start", tripWhere),
          end: number(trip, "end", tripWhere),
          from_layover: boolean(trip, "from_layover", tripWhere),
        };
      }),
    };
  });
}
