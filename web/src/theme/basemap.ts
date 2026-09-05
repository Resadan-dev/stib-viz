/**
 * The night basemap: our own MapLibre style over OpenFreeMap vector tiles (OpenMapTiles schema).
 *
 * Roads and water are barely visible, there are no points of interest and place names are rare
 * and discreet (SCOPE.md, section 4.2). The basemap must never compete with the vehicles, and
 * the network layer drawn by deck.gl keeps the map readable when these tiles fail to load.
 */

import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  StyleSpecification,
} from "maplibre-gl";

export const OPENFREEMAP_TILES = "https://tiles.openfreemap.org/planet";
export const OPENFREEMAP_GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
export const BASEMAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
  '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> ' +
  'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

const GROUND = "#04060c";
const WATER = "#0a1020";
const PARK = "#070c12";
const ROAD_MINOR = "#0f141d";
const ROAD_MAJOR = "#151b27";
const ROAD_MOTORWAY = "#1a2231";
const LABEL = "#3b4354";

const SOURCE = "openmaptiles";
const LINE: ExpressionSpecification = [
  "match",
  ["geometry-type"],
  ["LineString", "MultiLineString"],
  true,
  false,
];

function road(
  id: string,
  classes: string[],
  color: string,
  widths: [number, number],
): LayerSpecification {
  const filter: FilterSpecification = [
    "all",
    LINE,
    ["match", ["get", "class"], classes, true, false],
  ];
  return {
    id,
    type: "line",
    source: SOURCE,
    "source-layer": "transportation",
    filter,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": color,
      "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 11, widths[0], 16, widths[1]],
    },
  };
}

export function nightStyle(): StyleSpecification {
  return {
    version: 8,
    name: "stib-viz night",
    sources: {
      [SOURCE]: { type: "vector", url: OPENFREEMAP_TILES, attribution: BASEMAP_ATTRIBUTION },
    },
    glyphs: OPENFREEMAP_GLYPHS,
    layers: [
      { id: "background", type: "background", paint: { "background-color": GROUND } },
      {
        id: "park",
        type: "fill",
        source: SOURCE,
        "source-layer": "park",
        paint: { "fill-color": PARK },
      },
      {
        id: "water",
        type: "fill",
        source: SOURCE,
        "source-layer": "water",
        filter: ["!=", ["get", "brunnel"], "tunnel"],
        paint: { "fill-color": WATER },
      },
      {
        id: "waterway",
        type: "line",
        source: SOURCE,
        "source-layer": "waterway",
        paint: { "line-color": WATER, "line-width": 1 },
      },
      road("road-minor", ["minor", "service", "track", "path"], ROAD_MINOR, [0.2, 1.4]),
      road("road-major", ["primary", "secondary", "tertiary", "trunk"], ROAD_MAJOR, [0.5, 2.5]),
      road("road-motorway", ["motorway"], ROAD_MOTORWAY, [0.8, 3.5]),
      {
        id: "place-labels",
        type: "symbol",
        source: SOURCE,
        "source-layer": "place",
        minzoom: 10,
        filter: ["match", ["get", "class"], ["city", "town", "suburb"], true, false],
        layout: {
          "text-field": ["coalesce", ["get", "name:fr"], ["get", "name"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["match", ["get", "class"], "suburb", 10, 12],
          "text-letter-spacing": 0.08,
          "text-transform": "uppercase",
          "text-padding": 24,
        },
        paint: { "text-color": LABEL, "text-halo-color": GROUND, "text-halo-width": 1.2 },
      },
    ],
  };
}
