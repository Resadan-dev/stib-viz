/**
 * Night-time palette (SCOPE.md, section 4.2; ARCHITECTURE.md, section 6.5).
 *
 * Warm white for metro, the official colour for trams, one cool blue for buses, violet for
 * Noctis. The network is five levels of one blue-grey, dimmer underground.
 */

import type { Mode, NetworkProperties, RouteInfo } from "../data/contract";
import type { ColourScheme } from "../state/app-state";

export type Rgb = readonly [number, number, number];
export type Rgba = [number, number, number, number];

export const MODE_COLORS: Readonly<Record<Mode, Rgb>> = {
  metro: [255, 232, 196],
  tram: [240, 200, 80],
  bus: [96, 170, 255],
  noctis: [178, 120, 255],
};

export const NETWORK_COLOR: Rgb = [88, 108, 140];
/** Alpha by intensity class 1 to 5; index 0 is unused. */
export const NETWORK_ALPHA_BY_CLASS: readonly number[] = [0, 28, 50, 78, 110, 150];
export const UNDERGROUND_ALPHA_FACTOR = 0.55;

export const BRUSSELS_VIEW = { longitude: 4.3517, latitude: 50.8467, zoom: 12 } as const;

export function parseHexColor(hex: string): Rgb | undefined {
  const match = /^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (match === null) {
    return undefined;
  }
  return [
    parseInt(match[1] ?? "0", 16),
    parseInt(match[2] ?? "0", 16),
    parseInt(match[3] ?? "0", 16),
  ];
}

/** Relative luminance of a colour, as WCAG 2.2 defines it. */
function relativeLuminance([r, g, b]: Rgb): number {
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between two six-digit hexadecimal colours, from 1 to 21. */
export function contrastRatio(foreground: string, background: string): number {
  const front = parseHexColor(foreground);
  const back = parseHexColor(background);
  if (front === undefined || back === undefined) {
    throw new Error(`unreadable colour: ${foreground} on ${background}`);
  }
  const a = relativeLuminance(front);
  const b = relativeLuminance(back);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Palette scheme: trams keep their official colour, every other mode takes the palette colour.
 * Official scheme: every route takes its own colour from the feed, the palette as a fallback.
 * STIB reuses about a dozen colours across its routes, so two unrelated lines can still match.
 */
export function routeColor(
  route: Pick<RouteInfo, "mode" | "color">,
  scheme: ColourScheme = "palette",
): Rgb {
  if (scheme === "palette" && route.mode !== "tram") {
    return MODE_COLORS[route.mode];
  }
  return parseHexColor(route.color) ?? MODE_COLORS[route.mode];
}

export function networkColor(properties: Pick<NetworkProperties, "class" | "underground">): Rgba {
  const intensity = Math.min(5, Math.max(1, Math.round(properties.class)));
  const alpha = NETWORK_ALPHA_BY_CLASS[intensity] ?? 0;
  const [r, g, b] = NETWORK_COLOR;
  return [r, g, b, properties.underground ? Math.round(alpha * UNDERGROUND_ALPHA_FACTOR) : alpha];
}
