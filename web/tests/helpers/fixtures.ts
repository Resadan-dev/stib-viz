/** Small, valid instances of the data contract, shaped like the files the pipeline writes. */

import type { DayIndex, Manifest, Mode, Network, Vehicle } from "../../src/data/contract";

const MINUTES = 1440;

function series(value = 0): number[] {
  return new Array<number>(MINUTES).fill(value);
}

function perMode(): Record<Mode, number[]> {
  return { metro: series(), tram: series(), bus: series(), noctis: series() };
}

export const INDEX: DayIndex = {
  generated_at: "2026-09-05T15:53:18Z",
  feed_version: "2_20_20260831_010702",
  feed_valid_from: "2026-08-31",
  feed_valid_to: "2026-09-27",
  service_day_start: "04:00",
  days: [
    {
      date: "2026-09-09",
      kind: "weekday",
      source: "schedule",
      manifest: "2026-09-09/manifest.json",
    },
    {
      date: "2026-09-11",
      kind: "weekday",
      source: "schedule",
      manifest: "2026-09-11/manifest.json",
    },
  ],
};

export const MANIFEST: Manifest = {
  date: "2026-09-09",
  source: "schedule",
  feed_version: "2_20_20260831_010702",
  attribution: "Source: STIB-MIVB – Open Data – 2026-09-05",
  network: "network/2_20_20260831_010702.json",
  service_day_start_s: 14400,
  totals: { trips: 3, vehicles: 2, km: 12.5 },
  peak: { vehicles: 2, minute: 240 },
  per_minute: { vehicles: perMode(), departures: perMode(), km: perMode() },
  routes: [
    {
      id: "1",
      name: "1",
      mode: "metro",
      color: "B5378C",
      text_color: "FFFFFF",
      long_name: "GARE DE L OUEST - STOCKEL",
    },
    {
      id: "7",
      name: "7",
      mode: "tram",
      color: "EFE048",
      text_color: "000000",
      long_name: "HEYSEL - VANDERKINDERE",
    },
  ],
  vehicles_file: "vehicles.json",
  vehicle_count: 2,
  slices: [
    { hour: 8, mode: "metro", path: "slices/08-metro.bin", bytes: 100, vertices: 2, paths: 1 },
    { hour: 8, mode: "tram", path: "slices/08-tram.bin", bytes: 100, vertices: 2, paths: 1 },
  ],
  stops_files: [{ hour: 8, path: "stops/08.json", bytes: 100 }],
  anomalies: { stop_offset: 0, truncated_after_28h: 0 },
};

export const NETWORK: Network = {
  type: "FeatureCollection",
  feed_version: "2_20_20260831_010702",
  intensity_breaks: [20, 60, 120, 240],
  features: [
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [4.3596, 50.8451],
          [4.35926, 50.84563],
        ],
      },
      properties: {
        mode: "tram",
        from: "1000",
        to: "2788",
        runs: 116,
        class: 3,
        underground: false,
        speed: 17.4,
      },
    },
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [4.33, 50.85],
          [4.34, 50.86],
        ],
      },
      properties: {
        mode: "metro",
        from: "8012",
        to: "8022",
        runs: 300,
        class: 5,
        underground: true,
        speed: 31.5,
      },
    },
  ],
  stops: {
    "1000": [4.3596, 50.8451, "DE BROUCKERE"],
    "2788": [4.35926, 50.84563, "BOURSE"],
  },
};

export const VEHICLES: Vehicle[] = [
  {
    block: "10474607",
    trips: [
      { route_idx: 0, headsign: "STOCKEL", start: 14400, end: 16200, from_layover: false },
      { route_idx: 0, headsign: "GARE DE L OUEST", start: 16500, end: 18300, from_layover: true },
    ],
  },
  {
    block: "10474608",
    trips: [{ route_idx: 1, headsign: "HEYSEL", start: 15000, end: 17400, from_layover: false }],
  },
];

/** Shallow copy with a patch, typed as unknown so invalid shapes can be built for the parsers. */
export function patched(base: object, patch: Record<string, unknown>): unknown {
  return { ...base, ...patch };
}
