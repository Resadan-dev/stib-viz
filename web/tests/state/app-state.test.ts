import { describe, expect, it } from "vitest";

import { DEFAULT_START_TIME_S, allModes, initialState } from "../../src/state/app-state";

describe("initialState", () => {
  it("opens at 08:00, at x300, paused, every mode visible, palette colours", () => {
    const state = initialState("2026-09-09");
    expect(state).toMatchObject({
      day: "2026-09-09",
      time: DEFAULT_START_TIME_S,
      speed: 300,
      playing: false,
      waiting: false,
      line: null,
      colours: "palette",
      camera: null,
      vehicle: null,
      follow: false,
    });
    expect(DEFAULT_START_TIME_S).toBe(14400);
    expect(state.modes).toEqual({ metro: true, tram: true, bus: true, noctis: true });
  });

  it("applies overrides", () => {
    const state = initialState("2026-09-09", { time: 100, playing: true, line: "7" });
    expect(state).toMatchObject({ time: 100, playing: true, line: "7" });
  });
});

describe("allModes", () => {
  it("builds a visibility record for the four modes", () => {
    expect(allModes(false)).toEqual({ metro: false, tram: false, bus: false, noctis: false });
  });
});
