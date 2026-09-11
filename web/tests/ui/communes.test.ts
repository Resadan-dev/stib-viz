// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { parseCoverageFigures, parseMunicipalities, type Coverage } from "../../src/data/coverage";
import { fr } from "../../src/i18n/fr";
import { createCommuneTable } from "../../src/ui/communes";
import { FIGURES, MUNICIPALITIES } from "../helpers/coverage";

// The table reads the figures and the names only.
const COVERAGE = {
  figures: parseCoverageFigures(FIGURES),
  municipalities: parseMunicipalities(MUNICIPALITIES),
} as Coverage;
const PERCENT = new Intl.NumberFormat("fr-BE", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function mount() {
  const parent = document.body.appendChild(document.createElement("div"));
  const onPoint = vi.fn();
  const table = createCommuneTable(parent, onPoint);
  const section = parent.querySelector<HTMLElement>("section.communes");
  if (section === null) {
    throw new Error("no table");
  }
  const rows = (): HTMLTableRowElement[] => [
    ...section.querySelectorAll<HTMLTableRowElement>("tbody tr"),
  ];
  const texts = (): string[][] =>
    rows().map((row) => [...row.children].map((child) => child.textContent));
  return { onPoint, table, section, rows, texts };
}

describe("createCommuneTable", () => {
  it("shows only while the coverage view is on and its figures are in", () => {
    const { table, section } = mount();
    expect(section.hidden).toBe(true);
    table.update(null, 4, true);
    expect(section.hidden).toBe(true);
    table.update(COVERAGE, 4, false);
    expect(section.hidden).toBe(true);
    table.update(COVERAGE, 4, true);
    expect(section.hidden).toBe(false);
    expect(section.querySelector("h2")?.textContent).toBe(fr.communesTitle);
  });

  it("sorts the municipalities by the hours they keep above ten, the Region last", () => {
    const { table, texts } = mount();
    table.update(COVERAGE, 4, true);
    // Auderghem: 4,200 resident-hours for 300 residents; Anderlecht: 1,000 for 100.
    expect(texts().map((row) => row[0])).toEqual(["Auderghem", "Anderlecht", fr.communesRegion]);
    expect(texts().map((row) => row[3])).toEqual(["14,0 h", "10,0 h", "13,0 h"]);
  });

  it("gives the share well served at the hour, and a bar of the classes, very high first", () => {
    const { table, rows, texts } = mount();
    table.update(COVERAGE, 4, true);
    expect(texts()[0]?.[2]).toBe(PERCENT.format(0.5));
    const segments = [...(rows()[0]?.querySelectorAll<HTMLElement>(".communes__segment") ?? [])];
    expect(segments.map((segment) => segment.hidden)).toEqual([false, false, false, false, true]);
    expect(segments[0]?.style.flexGrow).toBe("0.25");
    const label = rows()[0]?.querySelector(".communes__bar")?.getAttribute("aria-label") ?? "";
    expect(label).toContain(fr.coverageClass4);
    expect(label).not.toContain(fr.coverageClass0);
  });

  it("follows the hour without moving the rows", () => {
    const { table, rows, texts } = mount();
    table.update(COVERAGE, 4, true);
    const first = rows()[0];
    table.update(COVERAGE, 0, true);
    expect(rows()[0]).toBe(first);
    expect(texts()[0]?.[2]).toBe(PERCENT.format(0));
  });

  it("outlines the municipality of the row pointed at or focused, not the Region", () => {
    const { table, rows, onPoint } = mount();
    table.update(COVERAGE, 4, true);
    const [auderghem, , region] = rows();
    auderghem?.dispatchEvent(new Event("pointerenter"));
    expect(onPoint).toHaveBeenLastCalledWith(1);
    auderghem?.dispatchEvent(new Event("pointerleave"));
    expect(onPoint).toHaveBeenLastCalledWith(null);
    auderghem?.dispatchEvent(new FocusEvent("focus"));
    expect(onPoint).toHaveBeenLastCalledWith(1);
    expect(auderghem?.tabIndex).toBe(0);
    expect(region?.tabIndex).toBe(-1);
  });
});
