// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { fr } from "../../src/i18n/fr";
import {
  DEVIATION_SCALE,
  SPEED_SCALE_KMH,
  SPEED_TICKS_KMH,
  deviationColor,
  speedColor,
} from "../../src/theme/colors";
import { createNetworkLegend } from "../../src/ui/legend";

function mount() {
  const parent = document.body.appendChild(document.createElement("div"));
  const legend = createNetworkLegend(parent);
  const figure = parent.querySelector<HTMLElement>("figure.legend");
  if (figure === null) {
    throw new Error("no legend");
  }
  const caption = (): string | null | undefined => figure.querySelector("figcaption")?.textContent;
  const ticks = (): HTMLElement[] => [...figure.querySelectorAll<HTMLElement>(".legend__tick")];
  const bar = (): HTMLElement | null => figure.querySelector<HTMLElement>(".legend__bar");
  const gradient = (): string => bar()?.style.getPropertyValue("--speed-ramp") ?? "";
  return { parent, legend, figure, caption, ticks, bar, gradient };
}

function rgb([r, g, b]: readonly [number, number, number]): string {
  return `rgb(${String(r)}, ${String(g)}, ${String(b)})`;
}

describe("createNetworkLegend", () => {
  it("stays out of the way until the network is read by colour", () => {
    const { legend, figure } = mount();
    expect(figure.hidden).toBe(true);
    legend.update("speed");
    expect(figure.hidden).toBe(false);
    legend.update("relative");
    expect(figure.hidden).toBe(false);
    legend.update("runs");
    expect(figure.hidden).toBe(true);
  });

  it("graduates the speeds in kilometres per hour, where their colours fall", () => {
    const { legend, caption, ticks, gradient } = mount();
    legend.update("speed");
    expect(caption()).toBe(fr.legendSpeed);
    expect(ticks().map((tick) => tick.textContent)).toEqual(SPEED_TICKS_KMH.map(String));
    const [slow, fast] = SPEED_SCALE_KMH;
    const lefts = ticks().map((tick) => Number.parseFloat(tick.style.left));
    expect(lefts).toEqual(SPEED_TICKS_KMH.map((kmh) => ((kmh - slow) / (fast - slow)) * 100));
    expect(gradient()).toContain(rgb(speedColor(slow)));
    expect(gradient()).toContain(rgb(speedColor(fast)));
  });

  it("graduates the deviation in percent, with the usual speed named rather than numbered", () => {
    const { legend, caption, ticks, gradient } = mount();
    legend.update("relative");
    expect(caption()).toBe(fr.legendDeviation);
    const [slowest, fastest] = DEVIATION_SCALE;
    expect(ticks().map((tick) => tick.textContent)).toEqual(["−20 %", fr.legendUsual, "+30 %"]);
    // The usual speed is not the middle of the bar: the two arms have no reason to share it.
    const lefts = ticks().map((tick) => Number.parseFloat(tick.style.left));
    expect(lefts[0]).toBe(0);
    expect(lefts[2]).toBe(100);
    expect(lefts[1]).toBeCloseTo(((1 - slowest) / (fastest - slowest)) * 100, 5);
    expect(gradient()).toContain(rgb(deviationColor(1)));
    expect(gradient()).toContain(rgb(deviationColor(slowest)));
  });

  it("repaints the bar when the view changes rather than keeping the other scale", () => {
    const { legend, bar, gradient } = mount();
    legend.update("speed");
    const speeds = gradient();
    legend.update("relative");
    expect(gradient()).not.toBe(speeds);
    // Decoration only: the caption and the ticks carry the meaning for a screen reader.
    expect(bar()?.getAttribute("aria-hidden")).toBe("true");
  });
});
