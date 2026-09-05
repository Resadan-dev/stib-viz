// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import type { PerMinute } from "../../src/data/contract";
import { fr } from "../../src/i18n/fr";
import { allModes } from "../../src/state/app-state";
import { areaPath, createActivity, stackSeries } from "../../src/ui/activity";
import { MANIFEST } from "../helpers/fixtures";

const SERIES: PerMinute = { metro: [1, 2], tram: [3, 4], bus: [0, 0], noctis: [0, 0] };

describe("stackSeries", () => {
  it("stacks the visible modes in display order and finds the peak", () => {
    const { max, layers } = stackSeries(SERIES, allModes(true));
    expect(max).toBe(6);
    expect(layers.map((layer) => layer.mode)).toEqual(["metro", "tram", "bus", "noctis"]);
    expect(layers[0]).toMatchObject({ lower: [0, 0], upper: [1, 2] });
    expect(layers[1]).toMatchObject({ lower: [1, 2], upper: [4, 6] });
  });

  it("leaves hidden modes out and never divides by zero", () => {
    const { max, layers } = stackSeries(SERIES, { ...allModes(true), tram: false });
    expect(layers.map((layer) => layer.mode)).toEqual(["metro", "bus", "noctis"]);
    expect(max).toBe(2);
    expect(stackSeries(SERIES, allModes(false)).max).toBe(1);
  });
});

describe("areaPath", () => {
  it("draws the upper edge left to right and the lower edge back", () => {
    const layer = { mode: "metro" as const, lower: [0, 0], upper: [1, 2] };
    expect(areaPath(layer, 2, 2, 100)).toBe("M0,50 L2,0 L2,100 L0,100 Z");
  });
});

describe("createActivity", () => {
  it("is a range over the service day that reports seeks and shows the instant", () => {
    const parent = document.body.appendChild(document.createElement("div"));
    const onSeek = vi.fn();
    const activity = createActivity(parent, MANIFEST, onSeek);
    const range = parent.querySelector<HTMLInputElement>("input[type=range]");
    expect(range?.getAttribute("aria-label")).toBe(fr.scrubberLabel);
    expect(range?.min).toBe("0");
    expect(range?.max).toBe("86400");
    expect(range?.step).toBe("60");
    activity.update(46980, allModes(true));
    expect(range?.value).toBe("46980");
    expect(range?.getAttribute("aria-valuetext")).toBe("17:03");
    const cursor = parent.querySelector<HTMLElement>(".activity__cursor");
    expect(cursor?.style.left).toBe("54.375%");
    if (range === null) {
      throw new Error("no range");
    }
    range.value = "100";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onSeek).toHaveBeenCalledWith(100);
  });

  it("draws one area per visible mode and labels the hours", () => {
    const parent = document.body.appendChild(document.createElement("div"));
    const activity = createActivity(parent, MANIFEST, vi.fn());
    activity.update(0, allModes(true));
    expect(parent.querySelectorAll("path")).toHaveLength(4);
    activity.update(0, { ...allModes(true), bus: false, noctis: false });
    expect(parent.querySelectorAll("path")).toHaveLength(2);
    const hours = [...parent.querySelectorAll(".activity__hour")].map((el) => el.textContent);
    expect(hours).toEqual(["04", "08", "12", "16", "20", "00"]);
  });
});
