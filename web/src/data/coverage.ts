/**
 * How well the STIB serves the residents of each municipality (ARCHITECTURE.md, section 5.9;
 * docs/03-commune-coverage.md).
 *
 * Four files, fetched the first time the coverage view is opened and never before: the day's
 * figures, the class and departures of every drawn cell hour by hour, the municipality of every
 * cell of the grid, and the municipalities with their borders. The two grids travel compressed
 * inside the file, because the host does not compress binary responses, and are inflated here.
 *
 * The figures arrive as whole residents and whole departures; every share on the page is
 * divided here and rounded once, where it is shown.
 */

import { DataError, array, number, numberList, object, string, type Fields } from "./contract";
import type { DataSource, Day } from "./loader";

/** None, low, medium, high, very high. */
export const COVERAGE_CLASSES = 5;
/** The first class counted as well served: more than 10 departures per direction in the hour. */
export const HIGH_CLASS = 3;
const SCC1_MAGIC = 0x53434331;
const SCH1_MAGIC = 0x53434831;
const COVERAGE_VERSION = 1;
const CELLS_HEADER_BYTES = 16;
const HOURS_HEADER_BYTES = 24;

export interface AreaFigures {
  residents: number;
  /** For each hour from the first, the residents in each class, none to very high. */
  classes: readonly (readonly number[])[];
  /** For each hour, the departures per direction within reach of the median resident. */
  median: readonly number[];
  /** Residents times the hours they spend above 10 departures, summed over the day. */
  residentHours: number;
}

export interface CoverageFigures {
  /** The hour of the service day the first row stands for; 4 is 04:00. */
  firstHour: number;
  hours: number;
  /** Departures per direction where low, medium, high and very high begin. */
  thresholds: readonly number[];
  municipalitiesFile: string;
  cellsFile: string;
  hoursFile: string;
  region: AreaFigures;
  /** In the order of the municipalities file. */
  municipalities: readonly AreaFigures[];
}

export interface MunicipalityInfo {
  code: string;
  name: string;
  residents: number;
  /** Where its name goes: longitude, latitude. */
  label: [number, number];
}

export interface BorderPath {
  /** The one or two municipalities along it, as indices into the list. */
  municipalities: readonly number[];
  path: [number, number][];
}

export interface Municipalities {
  /** West, south, east, north of the grid, in degrees: where its image lies on the map. */
  bounds: readonly [number, number, number, number];
  nx: number;
  ny: number;
  list: readonly MunicipalityInfo[];
  borders: readonly BorderPath[];
}

export interface CoverageCells {
  nx: number;
  ny: number;
  /** For every cell in image order (rows from the north): 0 outside, then 1 for the first municipality. */
  municipality: Uint8Array;
  /** For every cell: its column in the hours file, or -1 when it is not drawn. */
  column: Int32Array;
  drawn: number;
}

export interface CoverageHours {
  firstHour: number;
  hours: number;
  cells: number;
  /** Hour after hour, the class of every drawn cell. */
  classes: Uint8Array;
  /** Hour after hour, the departures per direction within reach of every drawn cell. */
  departures: Uint8Array;
}

export interface Coverage {
  figures: CoverageFigures;
  municipalities: Municipalities;
  cells: CoverageCells;
  hours: CoverageHours;
}

function integerRows(value: unknown, rows: number, width: number, where: string): number[][] {
  if (!Array.isArray(value) || value.length !== rows) {
    throw new DataError(`${where}: expected ${String(rows)} rows`);
  }
  return value.map((row, i) => {
    const values = numberList(row, `${where}[${String(i)}]`);
    if (values.length !== width) {
      throw new DataError(`${where}[${String(i)}]: expected ${String(width)} values`);
    }
    return values;
  });
}

function parseArea(value: unknown, hours: number, where: string): AreaFigures {
  const fields = object(value, where);
  const median = numberList(fields.median, `${where}: median`);
  if (median.length !== hours) {
    throw new DataError(`${where}: median must hold ${String(hours)} values`);
  }
  return {
    residents: number(fields, "residents", where),
    classes: integerRows(fields.classes, hours, COVERAGE_CLASSES, `${where}: classes`),
    median,
    residentHours: number(fields, "resident_hours", where),
  };
}

export function parseCoverageFigures(value: unknown): CoverageFigures {
  const where = "coverage";
  const fields = object(value, where);
  const hours = number(fields, "hours", where);
  if (!Number.isInteger(hours) || hours < 1) {
    throw new DataError(`${where}: invalid hours`);
  }
  return {
    firstHour: number(fields, "first_hour", where),
    hours,
    thresholds: numberList(fields.thresholds, `${where}: thresholds`),
    municipalitiesFile: string(fields, "municipalities_file", where),
    cellsFile: string(fields, "cells_file", where),
    hoursFile: string(fields, "hours_file", where),
    region: parseArea(fields.region, hours, `${where}: region`),
    municipalities: array(fields, "municipalities", where).map((item, i) =>
      parseArea(item, hours, `${where}: municipalities[${String(i)}]`),
    ),
  };
}

function lonLat(value: unknown, where: string): [number, number] {
  const pair = numberList(value, where);
  if (pair.length !== 2) {
    throw new DataError(`${where}: expected [lon, lat]`);
  }
  return [pair[0] ?? 0, pair[1] ?? 0];
}

function parseGrid(fields: Fields, where: string): Pick<Municipalities, "bounds" | "nx" | "ny"> {
  const grid = object(fields.grid, `${where}: grid`);
  const bounds = numberList(grid.bounds, `${where}: grid.bounds`);
  const [west = 0, south = 0, east = 0, north = 0] = bounds;
  if (bounds.length !== 4 || west >= east || south >= north) {
    throw new DataError(`${where}: grid.bounds must be west, south, east, north`);
  }
  const nx = number(grid, "nx", `${where}: grid`);
  const ny = number(grid, "ny", `${where}: grid`);
  if (!Number.isInteger(nx) || !Number.isInteger(ny) || nx < 1 || ny < 1) {
    throw new DataError(`${where}: grid.nx and grid.ny must be whole numbers`);
  }
  return { bounds: [west, south, east, north], nx, ny };
}

export function parseMunicipalities(value: unknown): Municipalities {
  const where = "municipalities";
  const fields = object(value, where);
  const list = array(fields, "municipalities", where).map((item, i) => {
    const itemWhere = `${where}[${String(i)}]`;
    const entry = object(item, itemWhere);
    return {
      code: string(entry, "code", itemWhere),
      name: string(entry, "name", itemWhere),
      residents: number(entry, "residents", itemWhere),
      label: lonLat(entry.label, `${itemWhere}: label`),
    };
  });
  const borders = array(fields, "borders", where).map((item, i) => {
    const itemWhere = `${where}: borders[${String(i)}]`;
    const entry = object(item, itemWhere);
    const owners = numberList(entry.municipalities, `${itemWhere}.municipalities`);
    if (
      owners.length < 1 ||
      owners.some((k) => !Number.isInteger(k) || k < 0 || k >= list.length)
    ) {
      throw new DataError(`${itemWhere}: names a municipality the file does not list`);
    }
    const path = array(entry, "coordinates", itemWhere).map((point, k) =>
      lonLat(point, `${itemWhere}.coordinates[${String(k)}]`),
    );
    return { municipalities: owners, path };
  });
  return { ...parseGrid(fields, where), list, borders };
}

/** Inflate a gzip-compressed file in the browser; the name says which file failed. */
export async function inflate(buffer: ArrayBuffer, where: string): Promise<Uint8Array> {
  try {
    const body = new Response(buffer).body;
    if (body === null) {
      throw new DataError(`${where}: empty file`);
    }
    const stream = body.pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (error) {
    throw new DataError(`${where}: could not be inflated`, { cause: error });
  }
}

function header(bytes: Uint8Array, words: number, magic: number, format: string, where: string) {
  if (bytes.length < 4 * words) {
    throw new DataError(`${where}: too short for an ${format} header`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, 4 * words);
  const values = Array.from({ length: words }, (_, i) => view.getUint32(4 * i, true));
  if (values[0] !== magic || values[1] !== COVERAGE_VERSION) {
    throw new DataError(`${where}: not an ${format} file of version ${String(COVERAGE_VERSION)}`);
  }
  return values;
}

export function decodeCoverageCells(bytes: Uint8Array, where: string): CoverageCells {
  const [, , nx = 0, ny = 0] = header(bytes, 4, SCC1_MAGIC, "SCC1", where);
  const size = nx * ny;
  if (bytes.length !== CELLS_HEADER_BYTES + 2 * size) {
    throw new DataError(
      `${where}: ${String(bytes.length)} bytes for a ${String(nx)} × ${String(ny)} grid`,
    );
  }
  const municipality = bytes.slice(CELLS_HEADER_BYTES, CELLS_HEADER_BYTES + size);
  const mask = bytes.subarray(CELLS_HEADER_BYTES + size);
  const column = new Int32Array(size);
  let drawn = 0;
  for (let cell = 0; cell < size; cell++) {
    column[cell] = mask[cell] === 1 ? drawn++ : -1;
  }
  return { nx, ny, municipality, column, drawn };
}

export function decodeCoverageHours(bytes: Uint8Array, where: string): CoverageHours {
  const [, , cells = 0, hours = 0, firstHour = 0] = header(bytes, 6, SCH1_MAGIC, "SCH1", where);
  const size = cells * hours;
  if (bytes.length !== HOURS_HEADER_BYTES + 2 * size) {
    throw new DataError(
      `${where}: ${String(bytes.length)} bytes for ${String(hours)} hours of ${String(cells)} cells`,
    );
  }
  return {
    firstHour,
    hours,
    cells,
    classes: bytes.slice(HOURS_HEADER_BYTES, HOURS_HEADER_BYTES + size),
    departures: bytes.slice(HOURS_HEADER_BYTES + size),
  };
}

/** The row of the files for an hour of the service day as `hourOf` counts it (4 to 27). */
export function hourIndex(
  figures: Pick<CoverageFigures, "firstHour" | "hours">,
  hour: number,
): number {
  return Math.min(figures.hours - 1, Math.max(0, hour - figures.firstHour));
}

/** The share of the residents in each class during that row's hour. */
export function classShares(area: AreaFigures, index: number): number[] {
  const row = area.classes[index] ?? [];
  return Array.from({ length: COVERAGE_CLASSES }, (_, k) =>
    area.residents > 0 ? (row[k] ?? 0) / area.residents : 0,
  );
}

/** The share of the residents with more than 10 departures per direction within reach. */
export function wellServedShare(area: AreaFigures, index: number): number {
  return classShares(area, index)
    .slice(HIGH_CLASS)
    .reduce((total, share) => total + share, 0);
}

/** The hours of the day an average resident spends above 10 departures per direction. */
export function amplitudeHours(area: AreaFigures): number {
  return area.residents > 0 ? area.residentHours / area.residents : 0;
}

export async function loadCoverage(source: DataSource, day: Day): Promise<Coverage | null> {
  const path = day.manifest.coverage;
  if (path === null) {
    return null;
  }
  const figures = parseCoverageFigures(await source.json(path));
  const [names, cellsFile, hoursFile] = await Promise.all([
    source.json(figures.municipalitiesFile),
    source.binary(figures.cellsFile),
    source.binary(figures.hoursFile),
  ]);
  const municipalities = parseMunicipalities(names);
  const cells = decodeCoverageCells(await inflate(cellsFile, figures.cellsFile), figures.cellsFile);
  const hours = decodeCoverageHours(await inflate(hoursFile, figures.hoursFile), figures.hoursFile);
  if (cells.nx !== municipalities.nx || cells.ny !== municipalities.ny) {
    throw new DataError(
      `${figures.cellsFile}: the grid is not the one the municipalities describe`,
    );
  }
  if (
    hours.cells !== cells.drawn ||
    hours.hours !== figures.hours ||
    hours.firstHour !== figures.firstHour
  ) {
    throw new DataError(
      `${figures.hoursFile}: hours for ${String(hours.cells)} cells, ${String(cells.drawn)} drawn`,
    );
  }
  if (figures.municipalities.length !== municipalities.list.length) {
    throw new DataError(
      `${path}: figures for ${String(figures.municipalities.length)} municipalities, ${String(municipalities.list.length)} named`,
    );
  }
  return { figures, municipalities, cells, hours };
}
