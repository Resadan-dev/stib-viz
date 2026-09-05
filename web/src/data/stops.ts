/**
 * Stops of one hour, loaded on the first click within that hour and never earlier
 * (ARCHITECTURE.md, section 5.6): `{ "<vehicle>:<trip>": [[seconds, stop_id], ...] }`.
 */

import { DataError, type StopsFileEntry } from "./contract";

/** Scheduled stops of one trip: seconds since 04:00 and stop id, in order. */
export type StopTimes = [number, string][];
export type StopsFile = Record<string, StopTimes>;

export type StopsLoader = (entry: StopsFileEntry) => Promise<StopsFile>;

export interface StopsStore {
  /** The stops of the hour, or null when the manifest lists no file for it. */
  get(hour: number): Promise<StopsFile | null>;
}

export function parseStops(value: unknown): StopsFile {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DataError("stops: expected an object keyed by vehicle:trip");
  }
  const file: StopsFile = {};
  for (const [key, list] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(list)) {
      throw new DataError(`stops: ${key} is not a list`);
    }
    file[key] = list.map((item): [number, string] => {
      if (
        !Array.isArray(item) ||
        item.length !== 2 ||
        typeof item[0] !== "number" ||
        typeof item[1] !== "string"
      ) {
        throw new DataError(`stops: ${key} holds an entry that is not [seconds, stop id]`);
      }
      return [item[0], item[1]];
    });
  }
  return file;
}

export function createStopsStore(
  entries: readonly StopsFileEntry[],
  load: StopsLoader,
): StopsStore {
  const byHour = new Map(entries.map((entry) => [entry.hour, entry]));
  const loaded = new Map<number, StopsFile>();
  const pending = new Map<number, Promise<StopsFile>>();
  return {
    async get(hour) {
      const entry = byHour.get(hour);
      if (entry === undefined) {
        return null;
      }
      const done = loaded.get(hour);
      if (done !== undefined) {
        return done;
      }
      let promise = pending.get(hour);
      if (promise === undefined) {
        promise = load(entry).then(
          (file) => {
            loaded.set(hour, file);
            pending.delete(hour);
            return file;
          },
          (error: unknown) => {
            pending.delete(hour);
            throw error;
          },
        );
        pending.set(hour, promise);
      }
      return promise;
    },
  };
}
