// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { fr } from "../../src/i18n/fr";
import { allModes } from "../../src/state/app-state";
import { createCounters, formatKm } from "../../src/ui/counters";
import { MANIFEST } from "../helpers/fixtures";

function manifestWithFigures() {
  const copy = structuredClone(MANIFEST);
  copy.per_minute.vehicles.tram[783] = 12;
  copy.per_minute.vehicles.metro[783] = 4;
  copy.per_minute.departures.tram[783] = 250;
  copy.per_minute.km.tram[783] = 1234.6;
  copy.per_minute.km.metro[783] = 9876.4;
  return copy;
}

describe("formatKm", () => {
  it("rounds to the kilometre with a French thousands separator", () => {
    expect(formatKm(1234.6)).toBe("1 235");
    expect(formatKm(12)).toBe("12");
  });
});

describe("createCounters", () => {
  it("shows one row per mode, named, with the figures of the current minute", () => {
    const parent = document.createElement("div");
    const counters = createCounters(parent, manifestWithFigures());
    counters.update(46980, allModes(true));
    const rows = parent.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(4);
    const tram = rows[1];
    expect(tram?.querySelector("th")?.textContent).toBe(fr.modeTram);
    const cells = [...(tram?.querySelectorAll("td") ?? [])].map((cell) => cell.textContent);
    expect(cells).toEqual(["12", "250", "1 235"]);
    const totals = [...parent.querySelectorAll("tfoot td")].map((cell) => cell.textContent);
    expect(totals).toEqual(["16", "250", "11 111"]);
  });

  it("only touches the DOM when the minute changes and dims hidden modes", () => {
    const parent = document.createElement("div");
    const counters = createCounters(parent, manifestWithFigures());
    counters.update(46980, allModes(true));
    const cell = parent.querySelector("tbody tr:nth-child(2) td");
    if (cell === null) {
      throw new Error("no cell");
    }
    cell.textContent = "sentinel";
    counters.update(46990, allModes(true));
    expect(cell.textContent).toBe("sentinel");
    counters.update(47040, { ...allModes(true), bus: false });
    expect(cell.textContent).toBe("0");
    expect(parent.querySelector("tbody tr:nth-child(3)")?.classList.contains("is-hidden")).toBe(
      true,
    );
  });
});
