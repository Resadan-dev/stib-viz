import { describe, expect, it } from "vitest";

import { BASEMAP_ATTRIBUTION, MIN_LABEL_CONTRAST, nightStyle } from "../../src/theme/basemap";
import { MODE_COLORS, contrastRatio } from "../../src/theme/colors";

/** Every colour a layer paints with, however deep in an expression it is written. */
function colorsOf(value: unknown): string[] {
  if (typeof value === "string") {
    return /^#[0-9a-f]{6}$/i.test(value) ? [value.slice(1)] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item: unknown) => colorsOf(item));
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap((item) => colorsOf(item));
  }
  return [];
}

/** Ordered by luminance: the contrast against black rises with it and with nothing else. */
function brightness(colour: string): number {
  return contrastRatio(colour, "000000");
}

/**
 * The flat colour a named layer paints a property with, read as plain data. Narrowing the style's
 * own layer union by its discriminant and then indexing `paint` is what the types invite, and it
 * costs minutes: the paint of a symbol layer is a recursive union of every expression MapLibre
 * accepts, which the type-aware lint rules unfold until they hang. Reading it as `unknown` and
 * checking the shape at runtime asks the checker for nothing, and a style is data at runtime
 * anyway, which is where the map reads it from.
 */
function flatColour(layer: unknown, property: string): string | undefined {
  const paint: unknown = (layer as { paint?: unknown } | undefined)?.paint;
  if (typeof paint !== "object" || paint === null) {
    return undefined;
  }
  const value: unknown = (paint as Record<string, unknown>)[property];
  return typeof value === "string" ? value : undefined;
}

describe("nightStyle", () => {
  const style = nightStyle();

  it("is a version 8 style backed by OpenFreeMap vector tiles", () => {
    expect(style.version).toBe(8);
    expect(style.sources.openmaptiles).toMatchObject({
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
    });
    expect(style.glyphs).toContain("https://tiles.openfreemap.org/fonts/");
  });

  it("credits OpenFreeMap, OpenMapTiles and OpenStreetMap", () => {
    for (const name of ["OpenFreeMap", "OpenMapTiles", "OpenStreetMap"]) {
      expect(BASEMAP_ATTRIBUTION).toContain(name);
    }
  });

  it("references known sources with unique layer ids and a background first", () => {
    const ids = style.layers.map((layer) => layer.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(style.layers[0]?.type).toBe("background");
    for (const layer of style.layers) {
      if ("source" in layer) {
        expect(Object.keys(style.sources)).toContain(layer.source);
      }
    }
  });

  it("draws the green of Brussels from the layer that actually holds it", () => {
    // In the OpenMapTiles schema `park` is nature reserves and protected areas; the Forêt de
    // Soignes, the Bois de la Cambre and every city park are `landcover`, classes wood and
    // grass. Painting `park` alone left the south-east of the region a flat void.
    const landcover = style.layers.find(
      (layer) => "source-layer" in layer && layer["source-layer"] === "landcover",
    );
    expect(landcover, "no landcover layer: the parks and woods would not be drawn").toBeDefined();
    expect(landcover?.type).toBe("fill");
    const filter = JSON.stringify(
      landcover !== undefined && "filter" in landcover ? landcover.filter : [],
    );
    expect(filter).toContain("wood");
    expect(filter).toContain("grass");
  });

  it("paints the ground under the water, and the water under the streets", () => {
    const order = style.layers.map((layer) => layer.id);
    expect(order.indexOf("landcover")).toBeLessThan(order.indexOf("water"));
    expect(order.indexOf("water")).toBeLessThan(order.indexOf("road-minor"));
    expect(order.indexOf("road-motorway")).toBeLessThan(order.indexOf("place-labels"));
  });

  it("never competes with the vehicles: every colour it paints stays below the dimmest of them", () => {
    const dimmest = Math.min(
      ...Object.values(MODE_COLORS).map(([r, g, b]) =>
        brightness([r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")),
      ),
    );
    const painted = style.layers.flatMap((layer) => colorsOf(layer));
    expect(painted.length).toBeGreaterThan(5);
    for (const colour of painted) {
      expect(brightness(colour), `#${colour} is not a night-time colour`).toBeLessThan(dimmest);
    }
  });

  it("writes the place names legibly on the ground they sit on", () => {
    // Rare is not the same as unreadable. Their halo is the ground, so the ground is the
    // background to measure against whatever a name crosses, water or wood or a motorway.
    const ink = flatColour(
      style.layers.find((layer) => layer.id === "place-labels"),
      "text-color",
    );
    const paper = flatColour(
      style.layers.find((layer) => layer.id === "background"),
      "background-color",
    );
    expect(ink, "the place names carry no flat colour to audit").toBeDefined();
    expect(paper, "the ground carries no flat colour to audit").toBeDefined();
    const contrast = contrastRatio(String(ink).replace("#", ""), String(paper).replace("#", ""));
    expect(
      contrast,
      `${String(ink)} on ${String(paper)} is too faint to read`,
    ).toBeGreaterThanOrEqual(MIN_LABEL_CONTRAST);
  });

  it("draws no point of interest and labels only places", () => {
    for (const layer of style.layers) {
      const sourceLayer = "source-layer" in layer ? layer["source-layer"] : undefined;
      expect(sourceLayer).not.toBe("poi");
      if (layer.type === "symbol") {
        expect(sourceLayer).toBe("place");
      }
    }
  });
});
