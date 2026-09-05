import { describe, expect, it } from "vitest";

import { BASEMAP_ATTRIBUTION, nightStyle } from "../../src/theme/basemap";

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
