// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { fr } from "../../src/i18n/fr";
import { SPEED_SCALE_KMH, SPEED_TICKS_KMH, speedColor } from "../../src/theme/colors";
import { createSpeedLegend } from "../../src/ui/legend";

function mount() {
  const parent = document.body.appendChild(document.createElement("div"));
  const legend = createSpeedLegend(parent);
  const figure = parent.querySelector<HTMLElement>("figure.legend");
  if (figure === null) {
    throw new Error("no legend");
  }
  return { parent, legend, figure };
}

function rgb([r, g, b]: readonly [number, number, number]): string {
  return `rgb(${String(r)}, ${String(g)}, ${String(b)})`;
}

describe("createSpeedLegend", () => {
  it("stays out of the way until the network shows its speeds", () => {
    const { legend, figure } = mount();
    expect(figure.hidden).toBe(true);
    legend.update("speed");
    expect(figure.hidden).toBe(false);
    legend.update("runs");
    expect(figure.hidden).toBe(true);
  });

  it("names what it measures and graduates the bar in kilometres per hour", () => {
    const { figure } = mount();
    expect(figure.querySelector("figcaption")?.textContent).toBe(fr.legendSpeed);
    const ticks = [...figure.querySelectorAll<HTMLElement>(".legend__tick")];
    expect(ticks.map((tick) => tick.textContent)).toEqual(SPEED_TICKS_KMH.map(String));
    // Each tick sits where its speed falls on the scale, so the numbers read off the colours.
    const [slow, fast] = SPEED_SCALE_KMH;
    const lefts = ticks.map((tick) => Number.parseFloat(tick.style.left));
    expect(lefts).toEqual(SPEED_TICKS_KMH.map((kmh) => ((kmh - slow) / (fast - slow)) * 100));
  });

  it("paints the bar with the very ramp the map uses, slow end first", () => {
    const { figure } = mount();
    const bar = figure.querySelector<HTMLElement>(".legend__bar");
    const gradient = bar?.style.getPropertyValue("--speed-ramp") ?? "";
    const [slow, fast] = SPEED_SCALE_KMH;
    expect(gradient).toContain("linear-gradient(to right");
    const slowAt = gradient.indexOf(rgb(speedColor(slow)));
    const fastAt = gradient.indexOf(rgb(speedColor(fast)));
    expect(slowAt).toBeGreaterThan(-1);
    expect(fastAt).toBeGreaterThan(slowAt);
    // Decoration only: the caption and the ticks carry the meaning for a screen reader.
    expect(bar?.getAttribute("aria-hidden")).toBe("true");
  });
});
