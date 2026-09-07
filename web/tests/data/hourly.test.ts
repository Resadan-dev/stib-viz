import { describe, expect, it } from "vitest";

import { DataError } from "../../src/data/contract";
import { parseHourlySpeeds, segmentKey } from "../../src/data/hourly";
import { HOURLY, NETWORK, patched } from "../helpers/fixtures";

const TRAM = "tram|1000|2788";
const METRO = "metro|8012|8022";

describe("segmentKey", () => {
  it("names a segment the way the file keys it, the mode and both stops", () => {
    const [tram, metro] = NETWORK.features;
    if (tram === undefined || metro === undefined) {
      throw new Error("fixture features missing");
    }
    expect(segmentKey(tram.properties)).toBe(TRAM);
    expect(segmentKey(metro.properties)).toBe(METRO);
  });
});

describe("parseHourlySpeeds", () => {
  const speeds = parseHourlySpeeds(HOURLY);

  it("reads tenths of a km/h back as km/h, at the hour of the service day", () => {
    // The file counts its rows from its own first hour; the site counts hours as the slices do.
    expect(speeds.at(TRAM, 8)).toBeCloseTo(12.3, 5);
    expect(speeds.at(TRAM, 14)).toBeCloseTo(25.1, 5);
  });

  it("says nothing rather than zero for an hour the timetable could not time", () => {
    expect(speeds.at(TRAM, 9)).toBeNull();
    expect(speeds.at(METRO, 8)).toBeNull();
  });

  it("says nothing for a segment it does not carry, or an hour outside the day", () => {
    expect(speeds.at("bus|1|2", 8)).toBeNull();
    expect(speeds.at(TRAM, 3)).toBeNull();
    expect(speeds.at(TRAM, 28)).toBeNull();
  });

  it("refuses a file whose rows are not a full day of numbers", () => {
    const short = { ...HOURLY.speeds, [TRAM]: [1, 2, 3] };
    expect(() => parseHourlySpeeds(patched(HOURLY, { speeds: short }))).toThrow(DataError);
    const text = { ...HOURLY.speeds, [TRAM]: (HOURLY.speeds[TRAM] ?? []).map(String) };
    expect(() => parseHourlySpeeds(patched(HOURLY, { speeds: text }))).toThrow(/hourly/);
    expect(() => parseHourlySpeeds(patched(HOURLY, { hours: 12 }))).toThrow(/hourly/);
    expect(() => parseHourlySpeeds(patched(HOURLY, { speeds: [] }))).toThrow(/hourly/);
  });
});
