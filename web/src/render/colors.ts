/**
 * Colours unfolded once per slice, at mount time and again when the scheme or the selected line
 * changes: one RGBA per vertex for the trails and one per path for the heads, both from the
 * `route` field of the slice (ARCHITECTURE.md, sections 5.4 and 6.3).
 */

import type { RouteInfo } from "../data/contract";
import type { Slice } from "../data/stv1";
import type { ColourScheme } from "../state/app-state";
import { routeColor, type Rgb } from "../theme/colors";

/** Neutral grey for a route index the manifest does not know, which the checks should prevent. */
export const UNKNOWN_ROUTE_COLOR: Rgb = [200, 200, 200];
/** Opacity of every vehicle that is not on the selected line. */
export const DIMMED_ALPHA = 48;

export interface ColourOptions {
  scheme?: ColourScheme;
  /** Name of the selected line (the number people know); everything else is dimmed. */
  line?: string | null;
}

interface Rgba {
  rgb: Rgb;
  alpha: number;
}

function palette(routes: readonly RouteInfo[], options: ColourOptions): Rgba[] {
  const line = options.line ?? null;
  return routes.map((route) => ({
    rgb: routeColor(route, options.scheme),
    alpha: line === null || route.name === line ? 255 : DIMMED_ALPHA,
  }));
}

function colorOf(slice: Slice, path: number, colors: readonly Rgba[]): Rgba {
  return colors[slice.route[path] ?? -1] ?? { rgb: UNKNOWN_ROUTE_COLOR, alpha: 255 };
}

function write(out: Uint8Array, offset: number, { rgb, alpha }: Rgba): void {
  out[offset] = rgb[0];
  out[offset + 1] = rgb[1];
  out[offset + 2] = rgb[2];
  out[offset + 3] = alpha;
}

export function vertexColors(
  slice: Slice,
  routes: readonly RouteInfo[],
  options: ColourOptions = {},
): Uint8Array {
  const colors = palette(routes, options);
  const out = new Uint8Array(4 * slice.vertices);
  for (let path = 0; path < slice.paths; path += 1) {
    const color = colorOf(slice, path, colors);
    const end = slice.index[path + 1] ?? 0;
    for (let vertex = slice.index[path] ?? 0; vertex < end; vertex += 1) {
      write(out, 4 * vertex, color);
    }
  }
  return out;
}

export function pathColors(
  slice: Slice,
  routes: readonly RouteInfo[],
  options: ColourOptions = {},
): Uint8Array {
  const colors = palette(routes, options);
  const out = new Uint8Array(4 * slice.paths);
  for (let path = 0; path < slice.paths; path += 1) {
    write(out, 4 * path, colorOf(slice, path, colors));
  }
  return out;
}
