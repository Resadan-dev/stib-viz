/**
 * The URL as shareable state (ARCHITECTURE.md, section 6.4).
 *
 * `?d=2026-09-09&t=17:03&s=300&m=metro,tram&l=7&colours=official&c=50.846,4.352,12.4&p=1`
 *
 * Reading ignores invalid values one by one; writing leaves the defaults out and is debounced,
 * so the address bar follows the scene without a rewrite on every frame.
 */

import { MODES, type Mode } from "../data/contract";
import { formatClock, parseClock } from "../time/clock";
import { SPEEDS } from "../time/player";
import {
  DAY_START_TIME_S,
  NETWORK_VIEWS,
  allModes,
  type AppState,
  type Camera,
  type ColourScheme,
  type NetworkView,
} from "./app-state";
import type { Store } from "./store";

export interface UrlState {
  day?: string;
  time?: number;
  playing?: boolean;
  camera?: Camera;
  speed?: number;
  modes?: Mode[];
  line?: string;
  colours?: ColourScheme;
  network?: NetworkView;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LINE_ID = /^[A-Za-z0-9-]{1,10}$/;
export const URL_DEBOUNCE_MS = 300;

/** `c=lat,lon,zoom[,bearing,pitch]`; bearing and pitch are accepted and ignored in v1. */
export function parseCamera(text: string): Camera | undefined {
  const parts = text.split(",").map(Number);
  const [latitude, longitude, zoom] = parts;
  if (parts.length < 3 || parts.length > 5 || parts.some((part) => !Number.isFinite(part))) {
    return undefined;
  }
  if (latitude === undefined || longitude === undefined || zoom === undefined) {
    return undefined;
  }
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || zoom < 0 || zoom > 24) {
    return undefined;
  }
  return { latitude, longitude, zoom };
}

function isMode(value: string): value is Mode {
  return (MODES as readonly string[]).includes(value);
}

function isNetworkView(value: string): value is NetworkView {
  return (NETWORK_VIEWS as readonly string[]).includes(value);
}

export function readUrlState(search: string): UrlState {
  const params = new URLSearchParams(search);
  const state: UrlState = {};
  const day = params.get("d");
  if (day !== null && DATE.test(day)) {
    state.day = day;
  }
  const time = params.get("t");
  if (time !== null) {
    const parsed = parseClock(time);
    if (parsed !== undefined) {
      state.time = parsed;
    }
  }
  const speed = Number(params.get("s"));
  if ((SPEEDS as readonly number[]).includes(speed)) {
    state.speed = speed;
  }
  const modes = params.get("m");
  if (modes !== null) {
    const listed = modes.split(",").filter(isMode);
    const visible = MODES.filter((mode) => listed.includes(mode));
    if (visible.length > 0) {
      state.modes = visible;
    }
  }
  const line = params.get("l");
  if (line !== null && LINE_ID.test(line)) {
    state.line = line;
  }
  const colours = params.get("colours");
  if (colours === "official" || colours === "palette") {
    state.colours = colours;
  }
  const network = params.get("network");
  if (network !== null && isNetworkView(network)) {
    state.network = network;
  }
  const camera = params.get("c");
  if (camera !== null) {
    const parsed = parseCamera(camera);
    if (parsed !== undefined) {
      state.camera = parsed;
    }
  }
  const playing = params.get("p");
  if (playing === "1") {
    state.playing = true;
  } else if (playing === "0") {
    state.playing = false;
  }
  return state;
}

/** The canonical query for a state; every value is plain ASCII, so no percent-encoding. */
export function writeUrlState(state: AppState): string {
  const pairs: [string, string][] = [
    ["d", state.day],
    ["t", formatClock(state.time)],
    ["s", String(state.speed)],
  ];
  const visible = MODES.filter((mode) => state.modes[mode]);
  if (visible.length < MODES.length) {
    pairs.push(["m", visible.join(",")]);
  }
  if (state.line !== null) {
    pairs.push(["l", encodeURIComponent(state.line)]);
  }
  if (state.colours !== "palette") {
    pairs.push(["colours", state.colours]);
  }
  if (state.network !== "runs") {
    pairs.push(["network", state.network]);
  }
  if (state.camera !== null) {
    const { latitude, longitude, zoom } = state.camera;
    pairs.push(["c", `${latitude.toFixed(4)},${longitude.toFixed(4)},${zoom.toFixed(1)}`]);
  }
  pairs.push(["p", state.playing ? "1" : "0"]);
  return `?${pairs.map(([key, value]) => `${key}=${value}`).join("&")}`;
}

/**
 * The query for another day: the same scene, wound back to 04:00. A day is watched from its
 * beginning, and the instant of the day one is leaving means nothing in the one being opened.
 */
export function dayUrl(state: AppState, date: string): string {
  return writeUrlState({ ...state, day: date, time: DAY_START_TIME_S });
}

/** A state with the values the URL provides; anything the URL leaves out keeps its value. */
export function applyUrlState(state: AppState, url: UrlState): AppState {
  const modes =
    url.modes === undefined
      ? state.modes
      : { ...allModes(false), ...Object.fromEntries(url.modes.map((mode) => [mode, true])) };
  return {
    ...state,
    day: url.day ?? state.day,
    time: url.time ?? state.time,
    playing: url.playing ?? state.playing,
    speed: url.speed ?? state.speed,
    modes,
    line: url.line ?? state.line,
    colours: url.colours ?? state.colours,
    network: url.network ?? state.network,
    camera: url.camera ?? state.camera,
  };
}

/** Keeps the address bar in step with the store, debounced; returns the function that stops it. */
export function syncUrl(
  store: Store<AppState>,
  replace: (query: string) => void,
  debounceMs = URL_DEBOUNCE_MS,
): () => void {
  let last = writeUrlState(store.get());
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = store.subscribe(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      const query = writeUrlState(store.get());
      if (query !== last) {
        last = query;
        replace(query);
      }
    }, debounceMs);
  });
  return () => {
    unsubscribe();
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  };
}
