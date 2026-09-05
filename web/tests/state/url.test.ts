import { describe, expect, it } from "vitest";

import { readUrlState } from "../../src/state/url";

describe("readUrlState", () => {
  it("reads the day, the instant and the playing flag", () => {
    expect(readUrlState("?d=2026-09-09&t=17:03&p=0")).toEqual({
      day: "2026-09-09",
      time: 46980,
      playing: false,
    });
  });

  it("ignores invalid values one by one", () => {
    expect(readUrlState("?d=tomorrow&t=25:99&p=maybe")).toEqual({});
    expect(readUrlState("?d=2026-09-09&t=nope")).toEqual({ day: "2026-09-09" });
  });

  it("reads a next-morning instant", () => {
    expect(readUrlState("?t=01:30&p=1")).toEqual({ time: 77400, playing: true });
  });

  it("reads the camera and rejects impossible ones", () => {
    expect(readUrlState("?c=50.846,4.352,12.4,0,0").camera).toEqual({
      latitude: 50.846,
      longitude: 4.352,
      zoom: 12.4,
    });
    expect(readUrlState("?c=50.846,4.352").camera).toBeUndefined();
    expect(readUrlState("?c=95,4.352,12").camera).toBeUndefined();
    expect(readUrlState("?c=50.8,4.3,30").camera).toBeUndefined();
    expect(readUrlState("?c=a,b,c").camera).toBeUndefined();
  });

  it("returns an empty state for an empty query", () => {
    expect(readUrlState("")).toEqual({});
  });
});
