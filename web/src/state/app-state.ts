/**
 * Shape and defaults of the single state object (ARCHITECTURE.md, section 6.4): the player
 * fields, the day, the filters, the selected line, the colour scheme, the camera and the
 * selected vehicle.
 */

import { MODES, type Mode } from "../data/contract";
import { DEFAULT_SPEED, type PlayerState } from "../time/player";

/** 04:30, half an hour into the service day: where the page opens until the URL says otherwise. */
export const DEFAULT_START_TIME_S = 1800;

/** 04:00, the first instant of the service day: where a day change and the reset land. */
export const DAY_START_TIME_S = 0;

export type ColourScheme = "palette" | "official";
/**
 * What the network layer shows: the runs of the day, the scheduled speed over each segment, or
 * how far this hour is from that segment's own speed for the day.
 */
export type NetworkView = "runs" | "speed" | "relative";
/** In the order the control offers them. */
export const NETWORK_VIEWS: readonly NetworkView[] = ["runs", "speed", "relative"];
export type ModeVisibility = Readonly<Record<Mode, boolean>>;

export interface Camera {
  latitude: number;
  longitude: number;
  zoom: number;
}

export interface AppState extends PlayerState {
  readonly day: string;
  readonly modes: ModeVisibility;
  /** Name of the selected line ("7", "N06"), or null when every line is shown alike. */
  readonly line: string | null;
  readonly colours: ColourScheme;
  readonly network: NetworkView;
  readonly camera: Camera | null;
  /** Index of the selected vehicle in vehicles.json, or null. */
  readonly vehicle: number | null;
  /** Whether the camera keeps the selected vehicle centred during playback. */
  readonly follow: boolean;
}

export function allModes(visible: boolean): ModeVisibility {
  return Object.fromEntries(MODES.map((mode) => [mode, visible])) as Record<Mode, boolean>;
}

export function initialState(day: string, overrides: Partial<AppState> = {}): AppState {
  return {
    day,
    time: DEFAULT_START_TIME_S,
    speed: DEFAULT_SPEED,
    playing: false,
    waiting: false,
    modes: allModes(true),
    line: null,
    colours: "palette",
    network: "runs",
    camera: null,
    vehicle: null,
    follow: false,
    ...overrides,
  };
}
