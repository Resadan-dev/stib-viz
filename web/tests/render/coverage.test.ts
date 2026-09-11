import type { TextureSource } from "@deck.gl/core";
import { describe, expect, it } from "vitest";

import { parseMunicipalities, type Coverage } from "../../src/data/coverage";
import { fr } from "../../src/i18n/fr";
import {
  COVERAGE_GRID_ID,
  cellAt,
  coverageRgba,
  coverageTooltip,
  createCoverageLayers,
  mapName,
} from "../../src/render/coverage";
import { COVERAGE_RAMP } from "../../src/theme/colors";
import {
  CLASS_ROWS,
  DEPARTURE_ROWS,
  DRAWN_CELLS,
  DRAWN_RASTER,
  GRID,
  MUNICIPALITIES,
  MUNICIPALITY_RASTER,
} from "../helpers/coverage";

function columns(): Int32Array {
  let drawn = 0;
  return Int32Array.from(DRAWN_RASTER, (flag) => (flag === 1 ? drawn++ : -1));
}

const COVERAGE: Pick<Coverage, "cells" | "hours" | "municipalities"> = {
  cells: {
    nx: GRID.nx,
    ny: GRID.ny,
    municipality: Uint8Array.from(MUNICIPALITY_RASTER),
    column: columns(),
    drawn: DRAWN_CELLS,
  },
  hours: {
    firstHour: 4,
    hours: 24,
    cells: DRAWN_CELLS,
    classes: Uint8Array.from(CLASS_ROWS.flat()),
    departures: Uint8Array.from(DEPARTURE_ROWS.flat()),
  },
  municipalities: parseMunicipalities(MUNICIPALITIES),
};

describe("coverageRgba", () => {
  it("paints every drawn cell in the colour of its class, rows from the north", () => {
    const pixels = coverageRgba(COVERAGE, 4);
    expect([pixels.width, pixels.height]).toEqual([GRID.nx, GRID.ny]);
    // The fourth drawn cell, column 3, sits at pixel 4 (row 1, first cell) with class 3.
    expect(Array.from(pixels.data.subarray(16, 20))).toEqual([...(COVERAGE_RAMP[3] ?? []), 255]);
    // The first drawn cell holds class 0 at that hour, the darkest step, still opaque.
    expect(Array.from(pixels.data.subarray(0, 4))).toEqual([...(COVERAGE_RAMP[0] ?? []), 255]);
  });

  it("leaves every cell that is not drawn transparent", () => {
    const pixels = coverageRgba(COVERAGE, 4);
    expect(Array.from(pixels.data.subarray(4, 8))).toEqual([0, 0, 0, 0]); // too few residents
    expect(Array.from(pixels.data.subarray(32, 36))).toEqual([0, 0, 0, 0]); // outside the Region
  });

  it("paints a silent hour in the class of no service", () => {
    const pixels = coverageRgba(COVERAGE, 0);
    expect(Array.from(pixels.data.subarray(16, 20))).toEqual([...(COVERAGE_RAMP[0] ?? []), 255]);
  });
});

describe("cellAt", () => {
  it("finds the municipality and the column of the cell under a pixel", () => {
    expect(cellAt(COVERAGE, [2.7, 0.2])).toEqual({ municipality: 1, column: 1 });
    expect(cellAt(COVERAGE, [1, 0])).toEqual({ municipality: 0, column: -1 });
  });

  it("is nothing outside the Region or off the grid", () => {
    expect(cellAt(COVERAGE, [0, 2])).toBeNull();
    expect(cellAt(COVERAGE, [-1, 0])).toBeNull();
    expect(cellAt(COVERAGE, [4, 0])).toBeNull();
  });
});

describe("coverageTooltip", () => {
  it("names the municipality, the departures within reach and their class", () => {
    // Column 5 (pixel 3, 1): class 0 and 20 departures at 08:00, since 5 % 5 is 0.
    expect(coverageTooltip(COVERAGE, [3, 1], 4)).toBe(
      `Auderghem\n20 ${fr.coverageDepartureMany}\n${fr.coverageClass0}`,
    );
    // Column 1 (pixel 2, 0): class 1 and 4 departures.
    expect(coverageTooltip(COVERAGE, [2, 0], 4)).toBe(
      `Auderghem\n4 ${fr.coverageDepartureMany}\n${fr.coverageClass1}`,
    );
  });

  it("says one departure in the singular", () => {
    const hours = { ...COVERAGE.hours, departures: new Uint8Array(24 * DRAWN_CELLS).fill(1) };
    expect(coverageTooltip({ ...COVERAGE, hours }, [0, 0], 4)).toContain(
      `1 ${fr.coverageDepartureOne}`,
    );
  });

  it("says a capped count is at least that many", () => {
    const hours = { ...COVERAGE.hours, departures: new Uint8Array(24 * DRAWN_CELLS).fill(255) };
    expect(coverageTooltip({ ...COVERAGE, hours }, [0, 0], 4)).toContain(
      `${fr.coverageAtLeast} 255 ${fr.coverageDepartureMany}`,
    );
  });

  it("says a cell with few residents has none to speak of, and nothing outside", () => {
    expect(coverageTooltip(COVERAGE, [1, 0], 4)).toBe(`Anderlecht\n${fr.coverageFew}`);
    expect(coverageTooltip(COVERAGE, [0, 2], 4)).toBeNull();
  });
});

describe("mapName", () => {
  it("shortens the longest names on the map and leaves the others whole", () => {
    expect(mapName({ code: "21014", name: "Saint-Josse-ten-Noode" })).toBe("St-Josse");
    expect(mapName({ code: "21001", name: "Anderlecht" })).toBe("Anderlecht");
  });
});

describe("createCoverageLayers", () => {
  const image = { width: GRID.nx, height: GRID.ny } as unknown as TextureSource;

  it("lays the grid, the borders and the names, in that order", () => {
    const layers = createCoverageLayers(COVERAGE, image, null);
    expect(layers.map((layer) => layer.id)).toEqual([
      COVERAGE_GRID_ID,
      "coverage-borders",
      "coverage-names",
    ]);
    const grid = layers[0]?.props as unknown as {
      bounds: number[];
      pickable: boolean;
      textureParameters: Record<string, string>;
    };
    expect(grid.bounds).toEqual([4.3, 50.8, 4.4, 50.9]);
    expect(grid.pickable).toBe(true);
    expect(grid.textureParameters.minFilter).toBe("nearest");
    expect(grid.textureParameters.magFilter).toBe("nearest");
  });

  it("outlines the municipality asked about with its own borders only", () => {
    const layers = createCoverageLayers(COVERAGE, image, 1);
    expect(layers.map((layer) => layer.id)).toContain("coverage-highlight");
    const outline = layers.find((layer) => layer.id === "coverage-highlight");
    const data = outline?.props.data as { municipalities: number[] }[];
    expect(data.every((border) => border.municipalities.includes(1))).toBe(true);
    expect(data).toHaveLength(1);
  });
});
