import { describe, expect, it, vi } from "vitest";

import { DataError } from "../../src/data/contract";
import {
  amplitudeHours,
  classShares,
  decodeCoverageCells,
  decodeCoverageHours,
  hourIndex,
  inflate,
  loadCoverage,
  parseCoverageFigures,
  parseMunicipalities,
  wellServedShare,
} from "../../src/data/coverage";
import { createDataSource, type Day } from "../../src/data/loader";
import {
  CLASS_ROWS,
  DEPARTURE_ROWS,
  DRAWN_CELLS,
  FIGURES,
  GRID,
  MUNICIPALITIES,
  encodeCells,
  encodeHours,
} from "../helpers/coverage";
import { INDEX, MANIFEST, patched } from "../helpers/fixtures";

async function inflated(buffer: ArrayBuffer): Promise<Uint8Array> {
  return inflate(buffer, "test");
}

describe("parseCoverageFigures", () => {
  const figures = parseCoverageFigures(FIGURES);

  it("reads the hours, the thresholds and where the other three files are", () => {
    expect(figures.firstHour).toBe(4);
    expect(figures.hours).toBe(24);
    expect(figures.thresholds).toEqual([4, 10, 20]);
    expect(figures.municipalitiesFile).toBe(FIGURES.municipalities_file);
    expect(figures.cellsFile).toBe(FIGURES.cells_file);
    expect(figures.hoursFile).toBe(FIGURES.hours_file);
  });

  it("keeps every area in whole residents, per hour and class", () => {
    expect(figures.region.residents).toBe(400);
    expect(figures.region.classes).toHaveLength(24);
    expect(figures.region.classes[4]).toEqual([0, 100, 100, 100, 100]);
    expect(figures.region.median[4]).toBe(12);
    expect(figures.region.residentHours).toBe(5200);
    expect(figures.municipalities.map((m) => m.residents)).toEqual([100, 300]);
  });

  it("refuses an hour that does not hold five classes", () => {
    const classes = [...FIGURES.region.classes];
    classes[3] = [1, 2, 3];
    const broken = patched(FIGURES, { region: { ...FIGURES.region, classes } });
    expect(() => parseCoverageFigures(broken)).toThrow(/classes/);
  });

  it("refuses an area without a row for every hour", () => {
    const median = FIGURES.region.median.slice(0, 20);
    const broken = patched(FIGURES, { region: { ...FIGURES.region, median } });
    expect(() => parseCoverageFigures(broken)).toThrow(DataError);
  });

  it("refuses a file that names no file of hours", () => {
    const broken = patched(FIGURES, { hours_file: 7 });
    expect(() => parseCoverageFigures(broken)).toThrow(/hours_file/);
  });
});

describe("parseMunicipalities", () => {
  const municipalities = parseMunicipalities(MUNICIPALITIES);

  it("reads where the grid lies, the names and the borders", () => {
    expect(municipalities.bounds).toEqual([4.3, 50.8, 4.4, 50.9]);
    expect([municipalities.nx, municipalities.ny]).toEqual([GRID.nx, GRID.ny]);
    expect(municipalities.list.map((m) => m.name)).toEqual(["Anderlecht", "Auderghem"]);
    expect(municipalities.list[1]?.label).toEqual([4.38, 50.85]);
    expect(municipalities.borders[0]?.municipalities).toEqual([0, 1]);
    expect(municipalities.borders[1]?.path).toHaveLength(3);
  });

  it("refuses bounds that are not west, south, east, north", () => {
    const grid = { ...MUNICIPALITIES.grid, bounds: [4.4, 50.8, 4.3, 50.9] };
    expect(() => parseMunicipalities(patched(MUNICIPALITIES, { grid }))).toThrow(/bounds/);
  });

  it("refuses a border that names a municipality the file does not list", () => {
    const borders = [
      {
        municipalities: [0, 5],
        coordinates: [
          [4.35, 50.8],
          [4.35, 50.9],
        ],
      },
    ];
    expect(() => parseMunicipalities(patched(MUNICIPALITIES, { borders }))).toThrow(/borders/);
  });
});

describe("inflate", () => {
  it("gives back what gzip packed", async () => {
    const bytes = await inflated(encodeCells());
    expect(bytes.length).toBe(16 + 2 * GRID.nx * GRID.ny);
  });

  it("names the file it could not inflate", async () => {
    await expect(inflate(new Uint8Array([1, 2, 3]).buffer, "coverage/x.bin")).rejects.toThrow(
      /coverage\/x\.bin/,
    );
  });
});

describe("decodeCoverageCells", () => {
  it("reads the municipality of every cell and counts the drawn ones in image order", async () => {
    const cells = decodeCoverageCells(await inflated(encodeCells()), "cells");
    expect([cells.nx, cells.ny, cells.drawn]).toEqual([GRID.nx, GRID.ny, DRAWN_CELLS]);
    expect(Array.from(cells.municipality)).toEqual([1, 1, 2, 2, 1, 1, 2, 2, 0, 1, 2, 0]);
    expect(Array.from(cells.column)).toEqual([0, -1, 1, 2, 3, 4, -1, 5, -1, -1, -1, -1]);
  });

  it("refuses a file of another kind", async () => {
    const foreign = await inflated(encodeCells(undefined, undefined, { magic: 0x53545631 }));
    expect(() => decodeCoverageCells(foreign, "cells")).toThrow(/SCC1/);
  });

  it("refuses a file cut short", async () => {
    const whole = await inflated(encodeCells());
    expect(() => decodeCoverageCells(whole.slice(0, whole.length - 3), "cells")).toThrow(DataError);
  });
});

describe("decodeCoverageHours", () => {
  it("reads the class and the departures of every drawn cell, hour by hour", async () => {
    const hours = decodeCoverageHours(await inflated(encodeHours()), "hours");
    expect([hours.hours, hours.firstHour, hours.cells]).toEqual([24, 4, DRAWN_CELLS]);
    expect(Array.from(hours.classes.subarray(4 * DRAWN_CELLS, 5 * DRAWN_CELLS))).toEqual(
      CLASS_ROWS[4],
    );
    expect(Array.from(hours.departures.subarray(4 * DRAWN_CELLS, 5 * DRAWN_CELLS))).toEqual(
      DEPARTURE_ROWS[4],
    );
  });

  it("refuses a file of another version", async () => {
    const other = await inflated(encodeHours(undefined, undefined, 4, { version: 2 }));
    expect(() => decodeCoverageHours(other, "hours")).toThrow(/SCH1/);
  });
});

describe("the figures of an area", () => {
  const figures = parseCoverageFigures(FIGURES);

  it("turns an hour of the service day into a row of the file", () => {
    expect(hourIndex(figures, 4)).toBe(0);
    expect(hourIndex(figures, 8)).toBe(4);
    expect(hourIndex(figures, 27)).toBe(23);
    expect(hourIndex(figures, 30)).toBe(23);
  });

  it("divides only at the end: the share well served, the shares of every class", () => {
    expect(wellServedShare(figures.region, 4)).toBeCloseTo(0.5, 10);
    expect(wellServedShare(figures.region, 0)).toBe(0);
    expect(classShares(figures.region, 4)).toEqual([0, 0.25, 0.25, 0.25, 0.25]);
  });

  it("gives the hours a resident spends above ten departures, on average", () => {
    expect(amplitudeHours(figures.region)).toBe(13);
    expect(amplitudeHours({ ...figures.region, residents: 0 })).toBe(0);
  });
});

describe("loadCoverage", () => {
  const dayWith = (coverage: string | null): Day => ({
    entry: INDEX.days[0] ?? { date: "", kind: "", source: "", manifest: "" },
    directory: "2026-09-09/",
    manifest: { ...MANIFEST, coverage },
  });

  function sourceOf(files: Record<string, unknown>) {
    const fetchFn = vi.fn((input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const body = files[url];
      if (body === undefined) {
        return Promise.resolve(new Response("not found", { status: 404 }));
      }
      const payload = body instanceof ArrayBuffer ? body : JSON.stringify(body);
      return Promise.resolve(new Response(payload, { status: 200 }));
    });
    return createDataSource("/data", fetchFn);
  }

  const FILES = {
    "/data/coverage/day.json": FIGURES,
    [`/data/${FIGURES.municipalities_file}`]: MUNICIPALITIES,
    [`/data/${FIGURES.cells_file}`]: encodeCells(),
    [`/data/${FIGURES.hours_file}`]: encodeHours(),
  };

  it("is nothing for a day built without a reference of residents", async () => {
    await expect(loadCoverage(sourceOf(FILES), dayWith(null))).resolves.toBeNull();
  });

  it("fetches the four files and checks that they agree", async () => {
    const coverage = await loadCoverage(sourceOf(FILES), dayWith("coverage/day.json"));
    expect(coverage?.cells.drawn).toBe(DRAWN_CELLS);
    expect(coverage?.hours.cells).toBe(DRAWN_CELLS);
    expect(coverage?.municipalities.list).toHaveLength(2);
    expect(coverage?.figures.municipalities).toHaveLength(2);
  });

  it("refuses hours drawn for another grid", async () => {
    const files = { ...FILES, [`/data/${FIGURES.hours_file}`]: encodeHours([[1, 2]], [[3, 4]]) };
    await expect(loadCoverage(sourceOf(files), dayWith("coverage/day.json"))).rejects.toThrow(
      /drawn/,
    );
  });

  it("refuses figures for more municipalities than the file of names lists", async () => {
    const figures = { ...FIGURES, municipalities: [...FIGURES.municipalities, FIGURES.region] };
    const files = { ...FILES, "/data/coverage/day.json": figures };
    await expect(loadCoverage(sourceOf(files), dayWith("coverage/day.json"))).rejects.toThrow(
      /municipalities/,
    );
  });
});
