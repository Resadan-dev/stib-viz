/**
 * The coverage view on the map (docs/03-commune-coverage.md, D33 to D37): the grid of one hour
 * as a single image, the municipal borders and names over it, and what lies under the pointer.
 *
 * The grid is square in Web Mercator, so the image is laid over its bounds as it is and every
 * pixel lands on its cell. It is sampled nearest rather than linear: blended pixels would invent
 * colours that are no class at all.
 */

import type { Layer, TextureSource } from "@deck.gl/core";
import { BitmapLayer, PathLayer, TextLayer } from "@deck.gl/layers";

import type { BorderPath, Coverage, MunicipalityInfo } from "../data/coverage";
import { fr } from "../i18n/fr";
import {
  COVERAGE_BORDER,
  COVERAGE_HIGHLIGHT,
  COVERAGE_LABEL,
  COVERAGE_LABEL_OUTLINE,
  COVERAGE_OPACITY,
  COVERAGE_RAMP,
  type Rgb,
} from "../theme/colors";
import { FLAT } from "./layers";

export const COVERAGE_GRID_ID = "coverage-grid";
/** The departures a cell can carry in the file, one byte; more are written as that many. */
const DEPARTURES_CAP = 255;
const LABEL_FONT = '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif';
const LABEL_SIZE_PX = 12;
/** Names shortened on the map, keyed by municipality code; the table keeps them whole. */
const SHORT_NAMES: Readonly<Record<string, string>> = {
  "21003": "Berchem-Ste-Agathe",
  "21012": "Molenbeek",
  "21013": "St-Gilles",
  "21014": "St-Josse",
  "21018": "Woluwe-St-Lambert",
  "21019": "Woluwe-St-Pierre",
};
const CLASS_NAMES: readonly string[] = [
  fr.coverageClass0,
  fr.coverageClass1,
  fr.coverageClass2,
  fr.coverageClass3,
  fr.coverageClass4,
];

export interface RgbaPixels {
  width: number;
  height: number;
  /** Backed by a plain ArrayBuffer, which is what an ImageData accepts. */
  data: Uint8ClampedArray<ArrayBuffer>;
}

/**
 * The grid of one row's hour as RGBA pixels, rows from the north: every drawn cell in the colour
 * of its class, every other cell transparent, so woods, parks and the land beyond the Region keep
 * the basemap.
 */
export function coverageRgba(
  coverage: Pick<Coverage, "cells" | "hours">,
  index: number,
  ramp: readonly Rgb[] = COVERAGE_RAMP,
): RgbaPixels {
  const { cells, hours } = coverage;
  const data = new Uint8ClampedArray(cells.nx * cells.ny * 4);
  const offset = index * hours.cells;
  for (let cell = 0; cell < cells.column.length; cell++) {
    const column = cells.column[cell] ?? -1;
    if (column < 0) {
      continue;
    }
    const colour = ramp[hours.classes[offset + column] ?? 0] ?? ramp[0];
    if (colour === undefined) {
      continue;
    }
    const p = cell * 4;
    data[p] = colour[0];
    data[p + 1] = colour[1];
    data[p + 2] = colour[2];
    data[p + 3] = 255;
  }
  return { width: cells.nx, height: cells.ny, data };
}

export interface CellUnder {
  /** The municipality, as an index into the list. */
  municipality: number;
  /** The cell's column in the hours file, or -1 when it is not drawn. */
  column: number;
}

/** The cell at an image pixel, or null outside the grid or the Region. */
export function cellAt(
  coverage: Pick<Coverage, "cells">,
  pixel: readonly [number, number],
): CellUnder | null {
  const { nx, ny, municipality, column } = coverage.cells;
  const x = Math.floor(pixel[0]);
  const y = Math.floor(pixel[1]);
  if (x < 0 || y < 0 || x >= nx || y >= ny) {
    return null;
  }
  const cell = y * nx + x;
  const owner = municipality[cell] ?? 0;
  return owner === 0 ? null : { municipality: owner - 1, column: column[cell] ?? -1 };
}

/** What the tooltip says of the cell at a pixel during that row's hour; null outside the Region. */
export function coverageTooltip(
  coverage: Pick<Coverage, "cells" | "hours" | "municipalities">,
  pixel: readonly [number, number],
  index: number,
): string | null {
  const cell = cellAt(coverage, pixel);
  if (cell === null) {
    return null;
  }
  const name = coverage.municipalities.list[cell.municipality]?.name ?? "";
  if (cell.column < 0) {
    return `${name}\n${fr.coverageFew}`;
  }
  const at = index * coverage.hours.cells + cell.column;
  const departures = coverage.hours.departures[at] ?? 0;
  const count =
    departures >= DEPARTURES_CAP
      ? `${fr.coverageAtLeast} ${String(departures)}`
      : String(departures);
  const noun = departures === 1 ? fr.coverageDepartureOne : fr.coverageDepartureMany;
  return `${name}\n${count} ${noun}\n${CLASS_NAMES[coverage.hours.classes[at] ?? 0] ?? ""}`;
}

/** How a municipality is named on the map. */
export function mapName(municipality: Pick<MunicipalityInfo, "code" | "name">): string {
  return SHORT_NAMES[municipality.code] ?? municipality.name;
}

/**
 * The layers of the view, beneath the vehicles: the grid, the borders, the outline of the
 * municipality asked about if any, and the names on top. Rebuilt when the hour or the outlined
 * municipality changes, never per frame.
 */
export function createCoverageLayers(
  coverage: Pick<Coverage, "municipalities">,
  image: TextureSource,
  highlight: number | null,
): Layer[] {
  const { bounds, borders, list } = coverage.municipalities;
  const layers: Layer[] = [
    new BitmapLayer({
      id: COVERAGE_GRID_ID,
      image,
      bounds: [bounds[0], bounds[1], bounds[2], bounds[3]],
      opacity: COVERAGE_OPACITY,
      textureParameters: { minFilter: "nearest", magFilter: "nearest", mipmapFilter: "none" },
      pickable: true,
      parameters: FLAT,
    }),
    new PathLayer<BorderPath>({
      id: "coverage-borders",
      data: [...borders],
      getPath: (border) => border.path,
      getColor: COVERAGE_BORDER,
      getWidth: 1,
      widthUnits: "pixels",
      parameters: FLAT,
    }),
  ];
  if (highlight !== null) {
    layers.push(
      new PathLayer<BorderPath>({
        id: "coverage-highlight",
        data: borders.filter((border) => border.municipalities.includes(highlight)),
        getPath: (border) => border.path,
        getColor: COVERAGE_HIGHLIGHT,
        getWidth: 2.5,
        widthUnits: "pixels",
        jointRounded: true,
        parameters: FLAT,
      }),
    );
  }
  layers.push(
    new TextLayer<MunicipalityInfo>({
      id: "coverage-names",
      data: [...list],
      getPosition: (municipality) => municipality.label,
      getText: mapName,
      getSize: LABEL_SIZE_PX,
      sizeUnits: "pixels",
      getColor: COVERAGE_LABEL,
      fontFamily: LABEL_FONT,
      fontWeight: 600,
      characterSet: "auto",
      fontSettings: { sdf: true },
      outlineWidth: 4,
      outlineColor: COVERAGE_LABEL_OUTLINE,
      parameters: FLAT,
    }),
  );
  return layers;
}
