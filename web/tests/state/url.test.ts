import { afterEach, describe, expect, it, vi } from "vitest";

import { initialState } from "../../src/state/app-state";
import { createStore } from "../../src/state/store";
import { applyUrlState, dayUrl, readUrlState, syncUrl, writeUrlState } from "../../src/state/url";

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

  it("reads the speed, the visible modes, the line and the colour scheme", () => {
    expect(readUrlState("?s=600&m=metro,tram&l=7&colours=official")).toEqual({
      speed: 600,
      modes: ["metro", "tram"],
      line: "7",
      colours: "official",
    });
  });

  it("reads the network view, and ignores one it does not know", () => {
    expect(readUrlState("?network=speed")).toEqual({ network: "speed" });
    expect(readUrlState("?network=runs")).toEqual({ network: "runs" });
    expect(readUrlState("?network=delays")).toEqual({});
  });

  it("ignores unknown speeds, modes and colour schemes, and odd line ids", () => {
    expect(readUrlState("?s=450&m=boat,metro&l=%3Cscript%3E&colours=neon")).toEqual({
      modes: ["metro"],
    });
    expect(readUrlState("?m=boat&m=")).toEqual({});
  });

  it("returns an empty state for an empty query", () => {
    expect(readUrlState("")).toEqual({});
  });
});

describe("writeUrlState", () => {
  const base = initialState("2026-09-09", { time: 46980, playing: true });

  it("writes the canonical query with the defaults left out", () => {
    expect(writeUrlState(base)).toBe("?d=2026-09-09&t=17:03&s=300&p=1");
  });

  it("adds filters, line, colours and camera when they differ from the defaults", () => {
    const state = {
      ...base,
      modes: { ...base.modes, bus: false },
      line: "7",
      colours: "official" as const,
      camera: { latitude: 50.84612, longitude: 4.35234, zoom: 12.44 },
    };
    expect(writeUrlState(state)).toBe(
      "?d=2026-09-09&t=17:03&s=300&m=metro,tram,noctis&l=7&colours=official&c=50.8461,4.3523,12.4&p=1",
    );
  });

  it("names the network view only when it is not the runs of the day", () => {
    expect(writeUrlState({ ...base, network: "speed" })).toBe(
      "?d=2026-09-09&t=17:03&s=300&network=speed&p=1",
    );
    expect(writeUrlState({ ...base, network: "runs" })).toBe("?d=2026-09-09&t=17:03&s=300&p=1");
  });

  it("round-trips through readUrlState and applyUrlState", () => {
    const state = {
      ...base,
      time: 46999,
      speed: 120,
      modes: { metro: true, tram: false, bus: true, noctis: false },
      line: "N06",
      colours: "official" as const,
      network: "speed" as const,
      camera: { latitude: 50.8, longitude: 4.4, zoom: 14 },
    };
    const back = applyUrlState(initialState("2026-01-01"), readUrlState(writeUrlState(state)));
    expect(back).toEqual({ ...state, time: 46980 });
  });
});

describe("dayUrl", () => {
  const base = initialState("2026-09-09", { time: 46980, playing: true, line: "7" });

  it("keeps the scene but winds the clock back to the first instant of the day", () => {
    expect(dayUrl(base, "2026-09-11")).toBe("?d=2026-09-11&t=04:00&s=300&l=7&p=1");
  });

  it("winds back even when the day does not change", () => {
    expect(dayUrl(base, "2026-09-09")).toBe("?d=2026-09-09&t=04:00&s=300&l=7&p=1");
  });
});

describe("syncUrl", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes the query after a debounce, only when it changed", () => {
    vi.useFakeTimers();
    const store = createStore(initialState("2026-09-09"));
    const replace = vi.fn();
    const stop = syncUrl(store, replace, 300);

    store.set({ time: 14430 });
    vi.advanceTimersByTime(300);
    expect(replace).not.toHaveBeenCalled();

    store.set({ speed: 600 });
    store.set({ time: 14460 });
    vi.advanceTimersByTime(299);
    expect(replace).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("?d=2026-09-09&t=08:01&s=600&p=0");

    stop();
    store.set({ speed: 60 });
    vi.advanceTimersByTime(1000);
    expect(replace).toHaveBeenCalledTimes(1);
  });
});
