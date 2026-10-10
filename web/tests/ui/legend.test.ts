// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { fr } from "../../src/i18n/fr";
import {
  COVERAGE_BORDER,
  COVERAGE_RAMP,
  DEVIATION_SCALE,
  SPEED_SCALE_KMH,
  SPEED_TICKS_KMH,
  deviationColor,
  speedColor,
} from "../../src/theme/colors";
import { createNetworkLegend } from "../../src/ui/legend";

function mount(onGuide?: () => void) {
  const parent = document.body.appendChild(document.createElement("div"));
  const legend = createNetworkLegend(parent, onGuide);
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

describe("the legend of the coverage view", () => {
  it("shows one swatch per class, in the colour the grid paints it, with its departures", () => {
    const { legend, figure, caption, bar } = mount();
    legend.update("coverage");
    expect(figure.hidden).toBe(false);
    expect(caption()).toBe(fr.legendCoverage);
    expect(bar()?.hidden).toBe(true);
    const swatches = [...figure.querySelectorAll<HTMLElement>(".legend__swatch")];
    expect(swatches.map((swatch) => swatch.textContent)).toEqual([
      fr.coverageBand0,
      fr.coverageBand1,
      fr.coverageBand2,
      fr.coverageBand3,
      fr.coverageBand4,
    ]);
    expect(swatches.map((swatch) => swatch.style.getPropertyValue("--swatch"))).toEqual(
      COVERAGE_RAMP.map(rgb),
    );
  });

  it("gives the bar back to the speed views, and hides the swatches", () => {
    const { legend, figure, bar } = mount();
    legend.update("coverage");
    legend.update("speed");
    expect(bar()?.hidden).toBe(false);
    expect(figure.querySelector<HTMLElement>(".legend__swatches")?.hidden).toBe(true);
    legend.update("coverage");
    // Built once: coming back to the view does not stack a second set.
    expect(figure.querySelectorAll(".legend__swatch")).toHaveLength(5);
  });

  it("names the empty ground and the borders under the classes, as the map draws them", () => {
    const { legend, figure } = mount();
    legend.update("coverage");
    const keys = [...figure.querySelectorAll<HTMLElement>(".legend__key")];
    expect(keys.map((key) => key.textContent)).toEqual([fr.legendFew, fr.legendBorder]);
    // Read back as numbers: the colour of the map's borders, its alpha out of 255 turned to 0-1.
    const [r, g, b, a] = COVERAGE_BORDER;
    const colour = /^rgba\((\d+), (\d+), (\d+), ([0-9.]+)\)$/.exec(
      keys[1]?.style.getPropertyValue("--swatch") ?? "",
    );
    expect(colour?.slice(1, 4).map(Number)).toEqual([r, g, b]);
    expect(Number(colour?.[4])).toBeCloseTo(a / 255, 2);
    legend.update("speed");
    expect(figure.querySelector<HTMLElement>(".legend__keys")?.hidden).toBe(true);
    legend.update("coverage");
    expect(figure.querySelectorAll(".legend__key")).toHaveLength(2);
  });

  it("opens the notice from the coverage legend, and from no other", () => {
    const onGuide = vi.fn();
    const { legend, figure } = mount(onGuide);
    const button = (): HTMLButtonElement | null =>
      figure.querySelector<HTMLButtonElement>("button.legend__guide");
    legend.update("speed");
    expect(button()?.hidden).toBe(true);
    legend.update("coverage");
    expect(button()?.hidden).toBe(false);
    // The icon is drawn, not written: the name of the button is its words alone.
    expect(button()?.textContent).toBe(fr.guideOpen);
    expect(button()?.getAttribute("type")).toBe("button");
    button()?.click();
    expect(onGuide).toHaveBeenCalledTimes(1);
    legend.update("relative");
    expect(button()?.hidden).toBe(true);
  });

  it("offers no notice when there is none to open", () => {
    const { legend, figure } = mount();
    legend.update("coverage");
    expect(figure.querySelector(".legend__guide")).toBeNull();
  });
});
