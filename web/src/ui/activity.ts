/**
 * The activity curve, vehicles running per minute stacked by mode, doubling as the scrubber
 * (SCOPE.md, section 4.3). A native range input sits over the chart: it gives click, drag and
 * keyboard for free and is what screen readers see; the SVG and the cursor are decoration.
 */

import { MODES, type Manifest, type Mode, type PerMinute } from "../data/contract";
import { fr } from "../i18n/fr";
import type { ModeVisibility } from "../state/app-state";
import { MODE_COLORS } from "../theme/colors";
import { SERVICE_DAY_LENGTH_S, formatClock } from "../time/clock";

export interface StackLayer {
  mode: Mode;
  lower: number[];
  upper: number[];
}

export interface Activity {
  update(time: number, modes: ModeVisibility): void;
}

const CHART_WIDTH = 1440;
const CHART_HEIGHT = 100;
const HOUR_LABELS = ["04", "08", "12", "16", "20", "00"];

/** Stacks the visible modes in display order; `max` is at least 1 so nothing divides by zero. */
export function stackSeries(
  series: PerMinute,
  modes: ModeVisibility,
): { max: number; layers: StackLayer[] } {
  let running: number[] = series.metro.map(() => 0);
  const layers = MODES.filter((mode) => modes[mode]).map((mode) => {
    const lower = running;
    const upper = lower.map((value, i) => value + (series[mode][i] ?? 0));
    running = upper;
    return { mode, lower, upper };
  });
  return { max: Math.max(1, ...running), layers };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** The SVG path of one layer: upper edge left to right, lower edge back. */
export function areaPath(
  layer: StackLayer,
  max: number,
  width = CHART_WIDTH,
  height = CHART_HEIGHT,
): string {
  const count = layer.upper.length;
  const x = (i: number): number => (count > 1 ? round((i * width) / (count - 1)) : 0);
  const y = (value: number): number => round(height - (value / max) * height);
  const top = layer.upper.map(
    (value, i) => `${i === 0 ? "M" : "L"}${String(x(i))},${String(y(value))}`,
  );
  const bottom = layer.lower.map((value, i) => `L${String(x(i))},${String(y(value))}`).reverse();
  return `${top.join(" ")} ${bottom.join(" ")} Z`;
}

const SVG = "http://www.w3.org/2000/svg";

export function createActivity(
  parent: HTMLElement,
  manifest: Manifest,
  onSeek: (time: number) => void,
): Activity {
  const root = document.createElement("div");
  root.className = "activity";
  const chart = document.createElementNS(SVG, "svg");
  chart.setAttribute("class", "activity__chart");
  chart.setAttribute("viewBox", `0 0 ${String(CHART_WIDTH)} ${String(CHART_HEIGHT)}`);
  chart.setAttribute("preserveAspectRatio", "none");
  chart.setAttribute("aria-hidden", "true");
  const cursor = document.createElement("div");
  cursor.className = "activity__cursor";
  cursor.setAttribute("aria-hidden", "true");
  const range = document.createElement("input");
  range.type = "range";
  range.className = "activity__range";
  range.min = "0";
  range.max = String(SERVICE_DAY_LENGTH_S);
  range.step = "60";
  range.setAttribute("aria-label", fr.scrubberLabel);
  const hours = document.createElement("div");
  hours.className = "activity__hours";
  hours.setAttribute("aria-hidden", "true");
  HOUR_LABELS.forEach((label, i) => {
    const span = document.createElement("span");
    span.className = "activity__hour";
    span.textContent = label;
    span.style.left = `${String((i / 6) * 100)}%`;
    hours.append(span);
  });
  root.append(chart, cursor, range, hours);
  parent.append(root);

  let dragging = false;
  range.addEventListener("pointerdown", () => {
    dragging = true;
  });
  for (const type of ["pointerup", "pointercancel", "change"]) {
    range.addEventListener(type, () => {
      dragging = false;
    });
  }
  range.addEventListener("input", () => {
    onSeek(Number(range.value));
  });

  let shownVisible = "";
  return {
    update(time, modes) {
      const visible = MODES.filter((mode) => modes[mode]).join(",");
      if (visible !== shownVisible) {
        shownVisible = visible;
        chart.replaceChildren();
        const { max, layers } = stackSeries(manifest.per_minute.vehicles, modes);
        for (const layer of layers) {
          const path = document.createElementNS(SVG, "path");
          path.setAttribute("class", "activity__area");
          const [r, g, b] = MODE_COLORS[layer.mode];
          path.setAttribute("fill", `rgb(${String(r)} ${String(g)} ${String(b)})`);
          path.setAttribute("d", areaPath(layer, max));
          chart.append(path);
        }
      }
      if (!dragging) {
        range.value = String(Math.round(time));
      }
      range.setAttribute("aria-valuetext", formatClock(time));
      cursor.style.left = `${String(Math.round((time / SERVICE_DAY_LENGTH_S) * 100000) / 1000)}%`;
    },
  };
}
