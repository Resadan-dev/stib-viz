import { fr } from "../i18n/fr";
import type { NetworkView } from "../state/app-state";
import {
  COVERAGE_BORDER,
  COVERAGE_RAMP,
  DEVIATION_SCALE,
  DEVIATION_TICKS,
  SPEED_SCALE_KMH,
  SPEED_TICKS_KMH,
  deviationColor,
  speedColor,
  type Rgb,
} from "../theme/colors";

export interface NetworkLegend {
  update(view: NetworkView): void;
}

interface Tick {
  label: string;
  /** Where the tick sits along the bar, from 0 to 100. */
  at: number;
}

interface Scale {
  caption: string;
  gradient: string;
  ticks: Tick[];
}

function place(value: number, from: number, to: number): number {
  return ((value - from) / (to - from)) * 100;
}

/** ``count`` values from ``from`` to ``to``, both ends included. */
function spread(from: number, to: number, count: number): number[] {
  return Array.from({ length: count }, (_, step) => from + ((to - from) * step) / (count - 1));
}

/**
 * The gradient of a bar, sampled from the very ramp the map paints with, so the two can never
 * drift apart. The values to sample are given rather than spaced evenly, because a diverging
 * ramp has to be sampled at the point it turns: interpolated across it, the bar would cut the
 * corner and lose the very inflection it is there to show. Handed to the stylesheet as a custom
 * property rather than set as a background, which also keeps it readable in a simulated DOM.
 */
function gradient(
  colour: (value: number) => Rgb,
  values: readonly number[],
  from: number,
  to: number,
): string {
  const stops = values.map((value) => {
    const [r, g, b] = colour(value);
    return `rgb(${String(r)}, ${String(g)}, ${String(b)}) ${String(place(value, from, to))}%`;
  });
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

function speedScale(): Scale {
  const [slow, fast] = SPEED_SCALE_KMH;
  return {
    caption: fr.legendSpeed,
    gradient: gradient(speedColor, spread(slow, fast, 9), slow, fast),
    ticks: SPEED_TICKS_KMH.map((kmh) => ({ label: String(kmh), at: place(kmh, slow, fast) })),
  };
}

/** A share of the usual speed, written the way it is read: a percentage away from the habit. */
function deviationLabel(ratio: number): string {
  if (ratio === 1) {
    return fr.legendUsual;
  }
  const percent = Math.round((ratio - 1) * 100);
  // A true minus sign rather than a hyphen, and the space French puts before a percent sign.
  return `${percent > 0 ? "+" : "−"}${String(Math.abs(percent))} %`;
}

function deviationScale(): Scale {
  const [slowest, fastest] = DEVIATION_SCALE;
  return {
    caption: fr.legendDeviation,
    // Sampled arm by arm so the usual speed is a stop of its own, where the ramp turns.
    gradient: gradient(
      deviationColor,
      [...spread(slowest, 1, 5), ...spread(1, fastest, 5).slice(1)],
      slowest,
      fastest,
    ),
    ticks: DEVIATION_TICKS.map((ratio) => ({
      label: deviationLabel(ratio),
      at: place(ratio, slowest, fastest),
    })),
  };
}

const COVERAGE_BANDS: readonly string[] = [
  fr.coverageBand0,
  fr.coverageBand1,
  fr.coverageBand2,
  fr.coverageBand3,
  fr.coverageBand4,
];

/**
 * The five classes of the coverage view as swatches, darkest first, each with the departures it
 * stands for. The colour reaches the stylesheet as a custom property, as the gradient does.
 */
function coverageSwatches(): HTMLLIElement[] {
  return COVERAGE_RAMP.map(([r, g, b], k) => {
    const item = document.createElement("li");
    item.className = "legend__swatch";
    item.style.setProperty("--swatch", `rgb(${String(r)}, ${String(g)}, ${String(b)})`);
    item.textContent = COVERAGE_BANDS[k] ?? "";
    return item;
  });
}

/**
 * What else the coverage view draws: the ground left dark where almost nobody lives, and the
 * borders of the municipalities, in the colour the map gives them.
 */
function coverageKeys(): HTMLLIElement[] {
  const empty = document.createElement("li");
  empty.className = "legend__key legend__key--empty";
  empty.textContent = fr.legendFew;
  const border = document.createElement("li");
  border.className = "legend__key legend__key--border";
  const [r, g, b, a] = COVERAGE_BORDER;
  border.style.setProperty(
    "--swatch",
    `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${(a / 255).toFixed(2)})`,
  );
  border.textContent = fr.legendBorder;
  return [empty, border];
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** An "i" in a ring, drawn rather than written, so the button is named by its words alone. */
function infoIcon(): SVGSVGElement {
  const icon = document.createElementNS(SVG_NS, "svg");
  icon.setAttribute("viewBox", "0 0 16 16");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  icon.classList.add("legend__guide-icon");
  const ring = document.createElementNS(SVG_NS, "circle");
  ring.setAttribute("cx", "8");
  ring.setAttribute("cy", "8");
  ring.setAttribute("r", "7");
  const stem = document.createElementNS(SVG_NS, "path");
  stem.setAttribute("d", "M8 7.2v4.3");
  const dot = document.createElementNS(SVG_NS, "circle");
  dot.setAttribute("cx", "8");
  dot.setAttribute("cy", "4.7");
  dot.setAttribute("r", "1");
  dot.classList.add("legend__guide-dot");
  icon.append(ring, stem, dot);
  return icon;
}

function guideButton(onGuide: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "legend__guide";
  button.hidden = true;
  button.append(infoIcon(), fr.guideOpen);
  button.addEventListener("click", onGuide);
  return button;
}

/**
 * The scale of whichever view reads the network by colour: a bar painted with its ramp and the
 * values written under it at the place their colour falls, or, for the coverage view, one
 * swatch per class, then the dark ground and the borders, and the button that opens its notice
 * when there is one. Colour is the whole meaning of those views, so the legend stays in sight
 * wherever they are on, in the folded phone bar included; it is hidden while the network shows
 * its runs, where the intensity speaks for itself.
 */
export function createNetworkLegend(parent: HTMLElement, onGuide?: () => void): NetworkLegend {
  const figure = document.createElement("figure");
  figure.className = "legend";
  figure.hidden = true;
  const caption = document.createElement("figcaption");
  caption.className = "legend__title";
  const bar = document.createElement("div");
  bar.className = "legend__bar";
  bar.setAttribute("aria-hidden", "true");
  const ticks = document.createElement("div");
  ticks.className = "legend__ticks";
  const swatches = document.createElement("ul");
  swatches.className = "legend__swatches";
  swatches.hidden = true;
  const keys = document.createElement("ul");
  keys.className = "legend__swatches legend__keys";
  keys.hidden = true;
  figure.append(caption, bar, ticks, swatches, keys);
  const guide = onGuide === undefined ? null : guideButton(onGuide);
  if (guide !== null) {
    figure.append(guide);
  }
  parent.append(figure);

  let shown: NetworkView | null = null;
  return {
    update(view) {
      if (view === shown) {
        return;
      }
      shown = view;
      figure.hidden = view === "runs";
      const classes = view === "coverage";
      bar.hidden = classes;
      ticks.hidden = classes;
      swatches.hidden = !classes;
      keys.hidden = !classes;
      if (guide !== null) {
        guide.hidden = !classes;
      }
      if (view === "runs") {
        return;
      }
      if (classes) {
        caption.textContent = fr.legendCoverage;
        if (swatches.childElementCount === 0) {
          swatches.append(...coverageSwatches());
        }
        if (keys.childElementCount === 0) {
          keys.append(...coverageKeys());
        }
        return;
      }
      const scale = view === "speed" ? speedScale() : deviationScale();
      caption.textContent = scale.caption;
      bar.style.setProperty("--speed-ramp", scale.gradient);
      ticks.replaceChildren(
        ...scale.ticks.map((tick) => {
          const element = document.createElement("span");
          element.className = "legend__tick";
          element.textContent = tick.label;
          element.style.left = `${String(tick.at)}%`;
          return element;
        }),
      );
    },
  };
}
