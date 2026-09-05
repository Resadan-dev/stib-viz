import { describe, expect, it } from "vitest";

import {
  FIRST_HOUR,
  LAST_HOUR,
  SERVICE_DAY_LENGTH_S,
  civilTime,
  clampTime,
  formatClock,
  hourOf,
  minuteOf,
  parseClock,
} from "../../src/time/clock";

describe("civilTime", () => {
  it("starts the service day at 04:00", () => {
    expect(civilTime(0)).toEqual({ hours: 4, minutes: 0, seconds: 0, nextDay: false });
  });

  it("crosses midnight after twenty hours of service", () => {
    expect(civilTime(71999)).toEqual({ hours: 23, minutes: 59, seconds: 59, nextDay: false });
    expect(civilTime(72000)).toEqual({ hours: 0, minutes: 0, seconds: 0, nextDay: true });
  });

  it("renders 90,000 s as 05:00 the next day", () => {
    expect(civilTime(90000)).toEqual({ hours: 5, minutes: 0, seconds: 0, nextDay: true });
  });

  it("truncates fractional seconds", () => {
    expect(civilTime(46980.7).seconds).toBe(0);
  });
});

describe("formatClock", () => {
  it("formats HH:MM with leading zeros", () => {
    expect(formatClock(46980)).toBe("17:03");
    expect(formatClock(0)).toBe("04:00");
    expect(formatClock(86399)).toBe("03:59");
  });
});

describe("hours and minutes", () => {
  it("maps seconds since 04:00 to the GTFS hour of the slice", () => {
    expect(FIRST_HOUR).toBe(4);
    expect(LAST_HOUR).toBe(27);
    expect(hourOf(0)).toBe(4);
    expect(hourOf(3599)).toBe(4);
    expect(hourOf(3600)).toBe(5);
    expect(hourOf(86399)).toBe(27);
    expect(hourOf(SERVICE_DAY_LENGTH_S)).toBe(27);
  });

  it("maps seconds to the minute index of the manifest series", () => {
    expect(minuteOf(46980)).toBe(783);
    expect(minuteOf(86399)).toBe(1439);
    expect(minuteOf(SERVICE_DAY_LENGTH_S)).toBe(1439);
  });
});

describe("clampTime", () => {
  it("keeps the instant inside the service day", () => {
    expect(clampTime(-5)).toBe(0);
    expect(clampTime(1e6)).toBe(SERVICE_DAY_LENGTH_S);
    expect(clampTime(1234.5)).toBe(1234.5);
    expect(clampTime(Number.NaN)).toBe(0);
  });
});

describe("parseClock", () => {
  it("reads civil time into seconds since 04:00", () => {
    expect(parseClock("17:03")).toBe(46980);
    expect(parseClock("04:00")).toBe(0);
    expect(parseClock("03:59")).toBe(86340);
    expect(parseClock("01:30")).toBe(77400);
  });

  it("rejects anything but HH:MM", () => {
    expect(parseClock("25:00")).toBeUndefined();
    expect(parseClock("7:5")).toBeUndefined();
    expect(parseClock("17:60")).toBeUndefined();
    expect(parseClock("")).toBeUndefined();
  });
});
