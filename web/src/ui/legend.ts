import { fr } from "../i18n/fr";
import type { NetworkView } from "../state/app-state";
import { SPEED_SCALE_KMH, SPEED_TICKS_KMH, speedColor } from "../theme/colors";

export interface SpeedLegend {
  update(view: NetworkView): void;
}

/**
 * The gradient of the bar, sampled from the ramp the map itself paints with, so the two can never
 * drift apart. Handed to the stylesheet as a custom property rather than set as a background
 * directly, which also keeps it readable in a simulated DOM.
 */
function gradient(): string {
  const [slow, fast] = SPEED_SCALE_KMH;
  const stops = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const [r, g, b] = speedColor(slow + t * (fast - slow));
    return `rgb(${String(r)}, ${String(g)}, ${String(b)}) ${String(t * 100)}%`;
  });
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

/**
 * The scale of the speed view: a bar painted with the ramp and the speeds written under it at
 * the place their colour falls. Colour is the whole meaning of that view, so the legend stays
 * in sight wherever the view is on, in the folded phone bar included; it is hidden otherwise.
 */
export function createSpeedLegend(parent: HTMLElement): SpeedLegend {
  const figure = document.createElement("figure");
  figure.className = "legend";
  figure.hidden = true;
  const caption = document.createElement("figcaption");
  caption.className = "legend__title";
  caption.textContent = fr.legendSpeed;
  const bar = document.createElement("div");
  bar.className = "legend__bar";
  bar.setAttribute("aria-hidden", "true");
  bar.style.setProperty("--speed-ramp", gradient());
  const ticks = document.createElement("div");
  ticks.className = "legend__ticks";
  const [slow, fast] = SPEED_SCALE_KMH;
  for (const kmh of SPEED_TICKS_KMH) {
    const tick = document.createElement("span");
    tick.className = "legend__tick";
    tick.textContent = String(kmh);
    tick.style.left = `${String(((kmh - slow) / (fast - slow)) * 100)}%`;
    ticks.append(tick);
  }
  figure.append(caption, bar, ticks);
  parent.append(figure);
  return {
    update(view) {
      figure.hidden = view !== "speed";
    },
  };
}
