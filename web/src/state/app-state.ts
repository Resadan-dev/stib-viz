/**
 * Shape and defaults of the single state object (ARCHITECTURE.md, section 6.4): the player
 * fields, the day, the filters, the selected line, the colour scheme, the camera and the
 * selected vehicle.
 */

import { MODES, type Mode } from "../data/contract";
import { DEFAULT_SPEED, type PlayerState } from "../time/player";

/** 08:00, a lively instant to open on until the URL says otherwise. */
export const DEFAULT_START_TIME_S = 14400;

export type ColourScheme = "palette" | "official";
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
  readonly camera: Camera | null;
  /** Index of the selected vehicle in vehicles.json, or null. */
  readonly vehicle: number | null;
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
    camera: null,
    vehicle: null,
    ...overrides,
  };
}
