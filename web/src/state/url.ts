import { parseClock } from "../time/clock";

/** The part of the URL state the site reads today; writing it back arrives with milestone M3. */
export interface Camera {
  latitude: number;
  longitude: number;
  zoom: number;
}

export interface UrlState {
  day?: string;
  time?: number;
  playing?: boolean;
  camera?: Camera;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

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

/** Reads `?d=YYYY-MM-DD&t=HH:MM&p=0|1&c=lat,lon,zoom`; invalid values are ignored one by one. */
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
