/**
 * The service day runs from 04:00 to 04:00 the next morning (SCOPE.md, section 4.3). Every
 * instant in the site is a number of seconds since 04:00; this module converts to and from the
 * civil time shown to people.
 */

export const SERVICE_DAY_START_S = 14400;
export const SERVICE_DAY_LENGTH_S = 86400;
export const SECONDS_PER_HOUR = 3600;
export const MINUTES_PER_DAY = 1440;
/** GTFS hours of the slices: 4 is 04:00, 27 is 03:00 the next morning. */
export const FIRST_HOUR = 4;
export const LAST_HOUR = 27;

export interface CivilTime {
  hours: number;
  minutes: number;
  seconds: number;
  /** True from midnight on, when the clock shows the next calendar day. */
  nextDay: boolean;
}

export function civilTime(time: number): CivilTime {
  const total = Math.floor(time) + SERVICE_DAY_START_S;
  return {
    hours: Math.floor(total / SECONDS_PER_HOUR) % 24,
    minutes: Math.floor(total / 60) % 60,
    seconds: total % 60,
    nextDay: total >= SERVICE_DAY_LENGTH_S,
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `HH:MM` in civil time: 46,980 s renders as 17:03, 77,400 s as 01:30. */
export function formatClock(time: number): string {
  const civil = civilTime(time);
  return `${pad(civil.hours)}:${pad(civil.minutes)}`;
}

export function clampTime(time: number): number {
  if (Number.isNaN(time)) {
    return 0;
  }
  return Math.min(SERVICE_DAY_LENGTH_S, Math.max(0, time));
}

/** The GTFS hour of the slice covering an instant. */
export function hourOf(time: number): number {
  return Math.min(LAST_HOUR, FIRST_HOUR + Math.floor(clampTime(time) / SECONDS_PER_HOUR));
}

/** The index of an instant in the per-minute series of the manifest. */
export function minuteOf(time: number): number {
  return Math.min(MINUTES_PER_DAY - 1, Math.floor(clampTime(time) / 60));
}

/** Reads `HH:MM` civil time into seconds since 04:00; hours before 04:00 belong to the next morning. */
export function parseClock(text: string): number | undefined {
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  if (match === null) {
    return undefined;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return undefined;
  }
  const seconds = hours * SECONDS_PER_HOUR + minutes * 60 - SERVICE_DAY_START_S;
  return seconds < 0 ? seconds + SERVICE_DAY_LENGTH_S : seconds;
}
