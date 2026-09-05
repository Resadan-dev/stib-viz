/**
 * Colours unfolded once per slice, at mount time: one RGBA per vertex for the trails and one
 * per path for the heads, both from the `route` field of the slice (ARCHITECTURE.md, 5.4).
 */

import type { RouteInfo } from "../data/contract";
import type { Slice } from "../data/stv1";
import { routeColor, type Rgb } from "../theme/colors";

/** Neutral grey for a route index the manifest does not know, which the checks should prevent. */
export const UNKNOWN_ROUTE_COLOR: Rgb = [200, 200, 200];

function palette(routes: readonly RouteInfo[]): Rgb[] {
  return routes.map((route) => routeColor(route));
}

function colorOf(slice: Slice, path: number, colors: readonly Rgb[]): Rgb {
  return colors[slice.route[path] ?? -1] ?? UNKNOWN_ROUTE_COLOR;
}

export function vertexColors(slice: Slice, routes: readonly RouteInfo[]): Uint8Array {
  const colors = palette(routes);
  const out = new Uint8Array(4 * slice.vertices);
  for (let path = 0; path < slice.paths; path += 1) {
    const [r, g, b] = colorOf(slice, path, colors);
    const end = slice.index[path + 1] ?? 0;
    for (let vertex = slice.index[path] ?? 0; vertex < end; vertex += 1) {
      out[4 * vertex] = r;
      out[4 * vertex + 1] = g;
      out[4 * vertex + 2] = b;
      out[4 * vertex + 3] = 255;
    }
  }
  return out;
}

export function pathColors(slice: Slice, routes: readonly RouteInfo[]): Uint8Array {
  const colors = palette(routes);
  const out = new Uint8Array(4 * slice.paths);
  for (let path = 0; path < slice.paths; path += 1) {
    const [r, g, b] = colorOf(slice, path, colors);
    out[4 * path] = r;
    out[4 * path + 1] = g;
    out[4 * path + 2] = b;
    out[4 * path + 3] = 255;
  }
  return out;
}
