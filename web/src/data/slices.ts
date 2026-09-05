/**
 * Slice cache and mounting (ARCHITECTURE.md, section 6.1).
 *
 * Exactly one slice per mode is mounted at any instant: the store answers `mount(hour)` with
 * the slices the manifest lists for that hour and nothing else, so a slice the manifest does
 * not list is never requested. Loads are shared between prefetch and mount, a failed load is
 * not cached, and the cache keeps three hours around the mounted one.
 */

import { MODES, type Mode, type SliceEntry } from "./contract";
import type { Slice } from "./stv1";

export const CACHED_HOURS = 3;

export type SliceLoader = (entry: SliceEntry) => Promise<Slice>;

export interface MountedHour {
  readonly hour: number;
  readonly slices: ReadonlyMap<Mode, Slice>;
}

export interface SliceStore {
  /** The manifest entry of a slice, or undefined when the hour has no such slice. */
  listed(hour: number, mode: Mode): SliceEntry | undefined;
  /** True when every slice of the hour is in memory (vacuously true for an hour without slices). */
  cached(hour: number): boolean;
  /** Starts loading the slices of an hour; errors surface when the hour is mounted. */
  prefetch(hour: number): void;
  /** Loads what is missing and returns the slices of the hour, one per mode. */
  mount(hour: number): Promise<MountedHour>;
}

function keyOf(entry: SliceEntry): string {
  return `${String(entry.hour)}-${entry.mode}`;
}

export function createSliceStore(entries: readonly SliceEntry[], load: SliceLoader): SliceStore {
  const byHour = new Map<number, SliceEntry[]>();
  for (const entry of entries) {
    const list = byHour.get(entry.hour) ?? [];
    list.push(entry);
    byHour.set(entry.hour, list);
  }
  for (const list of byHour.values()) {
    list.sort((a, b) => MODES.indexOf(a.mode) - MODES.indexOf(b.mode));
  }

  const loaded = new Map<string, Slice>();
  const pending = new Map<string, Promise<Slice>>();

  function entriesOf(hour: number): SliceEntry[] {
    return byHour.get(hour) ?? [];
  }

  function request(entry: SliceEntry): Promise<Slice> {
    const key = keyOf(entry);
    const done = loaded.get(key);
    if (done !== undefined) {
      return Promise.resolve(done);
    }
    const inFlight = pending.get(key);
    if (inFlight !== undefined) {
      return inFlight;
    }
    const promise = load(entry).then(
      (slice) => {
        loaded.set(key, slice);
        pending.delete(key);
        return slice;
      },
      (error: unknown) => {
        pending.delete(key);
        throw error;
      },
    );
    pending.set(key, promise);
    return promise;
  }

  function evictAround(center: number): void {
    const reach = (CACHED_HOURS - 1) / 2;
    for (const key of [...loaded.keys()]) {
      const hour = Number(key.split("-")[0]);
      if (Math.abs(hour - center) > reach) {
        loaded.delete(key);
      }
    }
  }

  return {
    listed(hour, mode) {
      return entriesOf(hour).find((entry) => entry.mode === mode);
    },
    cached(hour) {
      return entriesOf(hour).every((entry) => loaded.has(keyOf(entry)));
    },
    prefetch(hour) {
      for (const entry of entriesOf(hour)) {
        // Best effort: a failure here is reported by the mount that needs the slice.
        request(entry).catch(() => undefined);
      }
    },
    async mount(hour) {
      const list = entriesOf(hour);
      const slices = await Promise.all(list.map((entry) => request(entry)));
      evictAround(hour);
      const byMode = new Map<Mode, Slice>();
      list.forEach((entry, i) => {
        const slice = slices[i];
        if (slice !== undefined) {
          byMode.set(entry.mode, slice);
        }
      });
      return { hour, slices: byMode };
    },
  };
}
