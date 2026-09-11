/**
 * Builds the coverage files in memory the way the pipeline writes them (ARCHITECTURE.md, section
 * 5.9), compressed with Node's own zlib so the site's decoder is tested against a second writer.
 *
 * The grid is 4 cells wide and 3 high, rows from the north. Municipality 1 holds the west half,
 * municipality 2 the east half, and six cells are drawn:
 *
 *     municipality   drawn      column among drawn cells
 *     1 1 2 2        1 0 1 1    0 . 1 2
 *     1 1 2 2        1 1 0 1    3 4 . 5
 *     0 1 2 0        0 0 0 0    . . . .
 */

import { gzipSync } from "node:zlib";

export const SCC1_MAGIC = 0x53434331;
export const SCH1_MAGIC = 0x53434831;
export const GRID = { nx: 4, ny: 3 } as const;
export const MUNICIPALITY_RASTER = [1, 1, 2, 2, 1, 1, 2, 2, 0, 1, 2, 0];
export const DRAWN_RASTER = [1, 0, 1, 1, 1, 1, 0, 1, 0, 0, 0, 0];
export const DRAWN_CELLS = 6;
export const HOURS = 24;
export const FIRST_HOUR = 4;

export interface Header {
  magic?: number;
  version?: number;
}

function packed(words: number[], ...bodies: Uint8Array[]): ArrayBuffer {
  const size = 4 * words.length + bodies.reduce((total, body) => total + body.length, 0);
  const raw = new Uint8Array(size);
  const view = new DataView(raw.buffer);
  words.forEach((word, i) => {
    view.setUint32(4 * i, word, true);
  });
  let offset = 4 * words.length;
  for (const body of bodies) {
    raw.set(body, offset);
    offset += body.length;
  }
  const zipped = gzipSync(raw);
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength);
}

export function encodeCells(
  municipality: readonly number[] = MUNICIPALITY_RASTER,
  drawn: readonly number[] = DRAWN_RASTER,
  header: Header = {},
): ArrayBuffer {
  return packed(
    [header.magic ?? SCC1_MAGIC, header.version ?? 1, GRID.nx, GRID.ny],
    Uint8Array.from(municipality),
    Uint8Array.from(drawn),
  );
}

/** Class and departures of every drawn cell, hour by hour: rows are hours, columns cells. */
export function hourRows(value: (hour: number, cell: number) => number): number[][] {
  return Array.from({ length: HOURS }, (_, hour) =>
    Array.from({ length: DRAWN_CELLS }, (__, cell) => value(hour, cell)),
  );
}

// At 08:00 (hour 4 of the service day) cell c holds class c % 5 and 4 * c departures; every
// other hour is silent.
export const CLASS_ROWS = hourRows((hour, cell) => (hour === 4 ? cell % 5 : 0));
export const DEPARTURE_ROWS = hourRows((hour, cell) => (hour === 4 ? 4 * cell : 0));

export function encodeHours(
  classes: readonly (readonly number[])[] = CLASS_ROWS,
  departures: readonly (readonly number[])[] = DEPARTURE_ROWS,
  firstHour = FIRST_HOUR,
  header: Header = {},
): ArrayBuffer {
  const cells = classes[0]?.length ?? 0;
  return packed(
    [header.magic ?? SCH1_MAGIC, header.version ?? 1, cells, classes.length, firstHour, 0],
    Uint8Array.from(classes.flat()),
    Uint8Array.from(departures.flat()),
  );
}

export interface AreaFile {
  residents: number;
  classes: number[][];
  median: number[];
  resident_hours: number;
}

/** An area whose residents are all in "none" but at 08:00, when a quarter to a half reach high. */
function area(residents: number, residentHours: number): AreaFile {
  const classes = Array.from({ length: HOURS }, (_, hour) =>
    hour === 4
      ? [0, residents / 4, residents / 4, residents / 4, residents / 4]
      : [residents, 0, 0, 0, 0],
  );
  const median = Array.from({ length: HOURS }, (_, hour) => (hour === 4 ? 12 : 0));
  return { residents, classes, median, resident_hours: residentHours };
}

export const FIGURES = {
  feed_version: "2_20_20260831_010702",
  first_hour: FIRST_HOUR,
  hours: HOURS,
  thresholds: [4, 10, 20],
  reach_m: [400, 800],
  place_m: 250,
  drawn_min_residents: 0.5,
  municipalities_file: "coverage/municipalities-aaaaaaaaaaaa.json",
  cells_file: "coverage/cells-bbbbbbbbbbbb.bin",
  hours_file: "coverage/2_20_20260831_010702-cccccccccccc-hours.bin",
  region: area(400, 5200),
  municipalities: [area(100, 1000), area(300, 4200)],
};

export const MUNICIPALITIES = {
  sources: { licence: "CC BY 4.0", attribution: "Source: Statbel (modified)" },
  grid: { nx: GRID.nx, ny: GRID.ny, ground_m: 50, bounds: [4.3, 50.8, 4.4, 50.9] },
  municipalities: [
    {
      code: "21001",
      name: "Anderlecht",
      name_nl: "Anderlecht",
      residents: 100,
      label: [4.32, 50.85],
    },
    { code: "21002", name: "Auderghem", name_nl: "Oudergem", residents: 300, label: [4.38, 50.85] },
  ],
  borders: [
    {
      municipalities: [0, 1],
      coordinates: [
        [4.35, 50.8],
        [4.35, 50.9],
      ],
    },
    {
      municipalities: [0],
      coordinates: [
        [4.3, 50.8],
        [4.3, 50.9],
        [4.35, 50.9],
      ],
    },
  ],
};
