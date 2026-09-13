// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { fr } from "../../src/i18n/fr";
import { COVERAGE_RAMP } from "../../src/theme/colors";
import { createCoverageGuide } from "../../src/ui/coverage-guide";

// jsdom 30 has no showModal or close on dialogs; the open attribute is what the test observes.
const dialogPrototype = HTMLDialogElement.prototype as {
  showModal?: () => void;
  close?: () => void;
};
dialogPrototype.showModal ??= function showModal(this: HTMLDialogElement) {
  this.open = true;
};
dialogPrototype.close ??= function close(this: HTMLDialogElement) {
  this.open = false;
};

function mount() {
  const parent = document.body.appendChild(document.createElement("div"));
  const guide = createCoverageGuide(parent);
  const dialog = parent.querySelector("dialog");
  if (dialog === null) {
    throw new Error("no dialog");
  }
  return { guide, dialog };
}

function rgb([r, g, b]: readonly [number, number, number]): string {
  return `rgb(${String(r)}, ${String(g)}, ${String(b)})`;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("createCoverageGuide", () => {
  it("stays closed until asked, and closes from its own button", () => {
    const { guide, dialog } = mount();
    expect(dialog.open).toBe(false);
    guide.open();
    expect(dialog.open).toBe(true);
    const close = dialog.querySelector<HTMLButtonElement>(".guide__close");
    expect(close?.getAttribute("aria-label")).toBe(fr.close);
    close?.click();
    expect(dialog.open).toBe(false);
  });

  it("is named by its title", () => {
    const { dialog } = mount();
    const id = dialog.getAttribute("aria-labelledby") ?? "";
    expect(id).not.toBe("");
    expect(document.getElementById(id)?.textContent).toBe(fr.guideTitle);
  });

  it("says what is seen, what the map shows and what it does not, in that order", () => {
    const { dialog } = mount();
    const titles = [...dialog.querySelectorAll(".guide__section h3")].map((h) => h.textContent);
    expect(titles).toEqual([fr.guideSeenTitle, fr.guideShowsTitle, fr.guideLimitsTitle]);
    const text = dialog.textContent;
    const copy = Object.entries(fr).filter(
      ([key]) => key.startsWith("guide") && key !== "guideOpen",
    );
    for (const [key, value] of copy) {
      expect(text, key).toContain(value);
    }
  });

  it("gives every term its explanation, side by side", () => {
    const { dialog } = mount();
    const terms = [...dialog.querySelectorAll("dt")].map((dt) => dt.textContent);
    expect(terms).toContain(fr.guideSeenEmptyTerm);
    expect(terms).toContain(fr.guideLimitsOthersTerm);
    for (const dt of dialog.querySelectorAll("dt")) {
      expect(dt.nextElementSibling?.tagName, dt.textContent).toBe("DD");
    }
  });

  it("draws the scale in the colours of the grid, each class with its rhythm", () => {
    const { dialog } = mount();
    const rows = [...dialog.querySelectorAll<HTMLTableRowElement>(".guide__scale tbody tr")];
    expect(rows.map((row) => row.cells[0]?.textContent)).toEqual([
      fr.coverageBand0,
      fr.coverageBand1,
      fr.coverageBand2,
      fr.coverageBand3,
      fr.coverageBand4,
    ]);
    expect(rows.map((row) => row.cells[1]?.textContent)).toEqual([
      fr.guideRhythm0,
      fr.guideRhythm1,
      fr.guideRhythm2,
      fr.guideRhythm3,
      fr.guideRhythm4,
    ]);
    expect(rows.map((row) => row.style.getPropertyValue("--swatch"))).toEqual(
      COVERAGE_RAMP.map(rgb),
    );
  });

  it("closes on a click beside it, and not on a click inside it", () => {
    const { guide, dialog } = mount();
    guide.open();
    dialog.querySelector<HTMLElement>(".guide__sheet")?.click();
    expect(dialog.open).toBe(true);
    // Around the sheet there is only the dialog's backdrop, which the dialog itself receives.
    dialog.click();
    expect(dialog.open).toBe(false);
  });
});
