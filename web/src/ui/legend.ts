import { fr } from "../i18n/fr";
import type { NetworkView } from "../state/app-state";
import {
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

/**
 * The scale of whichever view reads the network by colour: a bar painted with its ramp and the
 * values written under it at the place their colour falls. Colour is the whole meaning of those
 * views, so the legend stays in sight wherever they are on, in the folded phone bar included;
 * it is hidden while the network shows its runs, where the intensity speaks for itself.
 */
export function createNetworkLegend(parent: HTMLElement): NetworkLegend {
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
  figure.append(caption, bar, ticks);
  parent.append(figure);

  let shown: NetworkView | null = null;
  return {
    update(view) {
      if (view === shown) {
        return;
      }
      shown = view;
      figure.hidden = view === "runs";
      if (view === "runs") {
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
