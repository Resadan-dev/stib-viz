/**
 * Night-time palette (SCOPE.md, section 4.2; ARCHITECTURE.md, section 6.5).
 *
 * Warm white for metro, the official colour for trams, one cool blue for buses, violet for
 * Noctis. The network is five levels of one blue-grey, dimmer underground.
 */

import type { Mode, NetworkProperties, RouteInfo } from "../data/contract";
import type { ColourScheme, NetworkView } from "../state/app-state";

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

/**
 * The scale of the speed view, km/h: anything slower or faster holds the colour of its end.
 *
 * Cut to the network it describes rather than to round numbers. Measured on the feed of
 * 31 August 2026, the 2,989 segments of a weekday run from 2 to 79 km/h, but half of them sit
 * between 14 and 20, and nine in ten below 25: a scale of 8 to 40 spent two thirds of its ramp
 * on a tenth of the network and painted the rest one shade of rose. From 10 to 28 the middle
 * half spreads across a third of the ramp and the metro clips at the bright end, which is the
 * true reading: it is not on the same scale as the rest. Worth re-measuring if the timetable
 * ever shifts by more than a few km/h.
 */
export const SPEED_SCALE_KMH: readonly [number, number] = [10, 28];
/** Where the legend puts its numbers. */
export const SPEED_TICKS_KMH: readonly number[] = [10, 16, 22, 28];
/**
 * Slow to fast, on a night ground: a deep indigo, violet, red, orange, a pale straw. Luminance
 * climbs the whole way and starts low, so the slow parts of the city sink back into the night
 * while the fast ones glow, and the ramp still reads by brightness alone for eyes that do not
 * tell its hues apart.
 */
export const SPEED_RAMP: readonly Rgb[] = [
  [58, 24, 96],
  [124, 30, 110],
  [200, 55, 80],
  [246, 140, 55],
  [255, 246, 205],
];
/** A segment no run of the day could time: a neutral, dimmer than any speed. */
export const UNKNOWN_SPEED_COLOR: Rgba = [110, 118, 140, 90];
/** In the speed view the network is the picture rather than the background. */
export const SPEED_ALPHA = 210;

/** The colour of a speed on the ramp, held at the ends of the scale. */
export function speedColor(kmh: number): Rgb {
  const [slow, fast] = SPEED_SCALE_KMH;
  const t = Math.min(1, Math.max(0, (kmh - slow) / (fast - slow)));
  const last = SPEED_RAMP.length - 1;
  const step = Math.min(last - 1, Math.floor(t * last));
  const from = SPEED_RAMP[step] ?? [0, 0, 0];
  const to = SPEED_RAMP[step + 1] ?? from;
  const part = t * last - step;
  const mix = (channel: 0 | 1 | 2): number =>
    Math.round(from[channel] + (to[channel] - from[channel]) * part);
  return [mix(0), mix(1), mix(2)];
}

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

export type NetworkPaint = Pick<NetworkProperties, "class" | "underground" | "speed">;

/**
 * The colour of a network segment. In the runs view, the blue-grey of the network at an alpha
 * that rises with the daily runs, dimmer underground so the metro stays a backdrop. In the
 * speed view, the speed on its ramp at nearly full opacity, the metro undimmed since speed is
 * what it has to show, and a neutral for a segment the day could not time.
 */
export function networkColor(properties: NetworkPaint, view: NetworkView = "runs"): Rgba {
  if (view === "speed") {
    if (properties.speed === null) {
      return [...UNKNOWN_SPEED_COLOR];
    }
    const [r, g, b] = speedColor(properties.speed);
    return [r, g, b, SPEED_ALPHA];
  }
  const intensity = Math.min(5, Math.max(1, Math.round(properties.class)));
  const alpha = NETWORK_ALPHA_BY_CLASS[intensity] ?? 0;
  const [r, g, b] = NETWORK_COLOR;
  return [r, g, b, properties.underground ? Math.round(alpha * UNDERGROUND_ALPHA_FACTOR) : alpha];
}

/** The contrast a badge's number must keep on its route colour: WCAG AA for normal text. */
export const MIN_BADGE_CONTRAST = 4.5;

/**
 * Ink of a route badge: the text colour the feed gives when it reads on the route colour, else
 * black or white, whichever reads better. STIB writes white on its orange, red and green lines,
 * which the badges of the site would not pass an audit with.
 */
export function badgeInk(route: Pick<RouteInfo, "color" | "text_color">): string {
  if (parseHexColor(route.color) === undefined || parseHexColor(route.text_color) === undefined) {
    return route.text_color;
  }
  if (contrastRatio(route.text_color, route.color) >= MIN_BADGE_CONTRAST) {
    return route.text_color;
  }
  return contrastRatio("000000", route.color) >= contrastRatio("FFFFFF", route.color)
    ? "000000"
    : "FFFFFF";
}
