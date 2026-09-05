import { MODES, type Manifest, type Mode } from "../data/contract";
import { fr, modeLabel } from "../i18n/fr";
import type { ModeVisibility } from "../state/app-state";
import { MODE_COLORS } from "../theme/colors";
import { minuteOf } from "../time/clock";

export interface Counters {
  update(time: number, modes: ModeVisibility): void;
}

const NARROW_NO_BREAK_SPACE = " ";

/** A whole number with the French thousands separator; kilometres are rounded first. */
export function formatKm(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, NARROW_NO_BREAK_SPACE);
}

function cell(tag: "td" | "th", text = ""): HTMLTableCellElement {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

/**
 * Per-mode counters read from the per-minute series of the manifest (SCOPE.md, 4.4): vehicles
 * running at the top of the minute, trips departed and kilometres covered since 04:00.
 */
export function createCounters(parent: HTMLElement, manifest: Manifest): Counters {
  const table = document.createElement("table");
  table.className = "counters";
  const caption = document.createElement("caption");
  caption.textContent = fr.countersLabel;
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.append(cell("th"), cell("th", fr.countersVehicles), cell("th", fr.countersDepartures));
  headRow.append(cell("th", fr.countersKm));
  head.append(headRow);
  const body = document.createElement("tbody");
  const rows = new Map<Mode, { row: HTMLTableRowElement; cells: HTMLTableCellElement[] }>();
  for (const mode of MODES) {
    const row = document.createElement("tr");
    const name = cell("th", modeLabel(mode));
    name.scope = "row";
    const [r, g, b] = MODE_COLORS[mode];
    name.style.setProperty("--mode-colour", `rgb(${String(r)} ${String(g)} ${String(b)})`);
    const cells = [cell("td"), cell("td"), cell("td")];
    row.append(name, ...cells);
    body.append(row);
    rows.set(mode, { row, cells });
  }
  const foot = document.createElement("tfoot");
  const footRow = document.createElement("tr");
  const totalName = cell("th", fr.countersTotal);
  totalName.scope = "row";
  const totalCells = [cell("td"), cell("td"), cell("td")];
  footRow.append(totalName, ...totalCells);
  foot.append(footRow);
  table.append(caption, head, body, foot);
  parent.append(table);

  let shownMinute = -1;
  let shownVisible = "";
  return {
    update(time, modes) {
      const minute = minuteOf(time);
      const visible = MODES.filter((mode) => modes[mode]).join(",");
      if (minute === shownMinute && visible === shownVisible) {
        return;
      }
      shownMinute = minute;
      shownVisible = visible;
      const totals = [0, 0, 0];
      for (const mode of MODES) {
        const entry = rows.get(mode);
        if (entry === undefined) {
          continue;
        }
        const vehicles = manifest.per_minute.vehicles[mode][minute] ?? 0;
        const departures = manifest.per_minute.departures[mode][minute] ?? 0;
        const km = manifest.per_minute.km[mode][minute] ?? 0;
        const values = [vehicles, departures, km];
        entry.cells.forEach((element, i) => {
          element.textContent = formatKm(values[i] ?? 0);
        });
        entry.row.classList.toggle("is-hidden", !modes[mode]);
        values.forEach((value, i) => {
          totals[i] = (totals[i] ?? 0) + value;
        });
      }
      totalCells.forEach((element, i) => {
        element.textContent = formatKm(totals[i] ?? 0);
      });
    },
  };
}
