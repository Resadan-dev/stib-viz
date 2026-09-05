/**
 * Fetching and parsing the contract files (ARCHITECTURE.md, section 6.1).
 *
 * A `DataSource` hides the transport, so tests run against an in-memory fetch and the site
 * against the `/data/` directory served next to it.
 */

import {
  DataError,
  parseIndex,
  parseManifest,
  parseNetwork,
  parseVehicles,
  type DayIndex,
  type DayIndexEntry,
  type Manifest,
  type Network,
  type SliceEntry,
  type Vehicle,
} from "./contract";
import { decodeSlice, type Slice } from "./stv1";

export interface DataSource {
  json(path: string): Promise<unknown>;
  binary(path: string): Promise<ArrayBuffer>;
}

/** A day chosen from the index, with its manifest and the directory its files live in. */
export interface Day {
  entry: DayIndexEntry;
  directory: string;
  manifest: Manifest;
}

export function createDataSource(base: string, fetchFn: typeof fetch = fetch): DataSource {
  const prefix = base.endsWith("/") ? base : `${base}/`;

  async function get(path: string): Promise<Response> {
    let response: Response;
    try {
      response = await fetchFn(prefix + path);
    } catch (error) {
      throw new DataError(`${path}: network error`, { cause: error });
    }
    if (!response.ok) {
      throw new DataError(`${path}: HTTP ${String(response.status)}`);
    }
    return response;
  }

  return {
    async json(path) {
      const response = await get(path);
      try {
        return (await response.json()) as unknown;
      } catch (error) {
        throw new DataError(`${path}: invalid JSON`, { cause: error });
      }
    },
    async binary(path) {
      const response = await get(path);
      return response.arrayBuffer();
    },
  };
}

/** `2026-09-09/manifest.json` → `2026-09-09/`; the slices and stops are relative to it. */
export function dayDirectory(manifestPath: string): string {
  const slash = manifestPath.lastIndexOf("/");
  return slash < 0 ? "" : manifestPath.slice(0, slash + 1);
}

export async function loadIndex(source: DataSource): Promise<DayIndex> {
  return parseIndex(await source.json("index.json"));
}

export async function loadDay(source: DataSource, entry: DayIndexEntry): Promise<Day> {
  const manifest = parseManifest(await source.json(entry.manifest));
  if (manifest.date !== entry.date) {
    throw new DataError(`${entry.manifest}: describes ${manifest.date}, not ${entry.date}`);
  }
  return { entry, directory: dayDirectory(entry.manifest), manifest };
}

export async function loadNetwork(source: DataSource, day: Day): Promise<Network> {
  return parseNetwork(await source.json(day.manifest.network));
}

export async function loadVehicles(source: DataSource, day: Day): Promise<Vehicle[]> {
  return parseVehicles(await source.json(day.directory + day.manifest.vehicles_file));
}

export async function loadSlice(source: DataSource, day: Day, entry: SliceEntry): Promise<Slice> {
  const slice = decodeSlice(await source.binary(day.directory + entry.path));
  if (
    slice.hour !== entry.hour ||
    slice.paths !== entry.paths ||
    slice.vertices !== entry.vertices
  ) {
    throw new DataError(`${entry.path}: the file does not match its manifest entry`);
  }
  return slice;
}
