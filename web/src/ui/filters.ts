import { MODES, type Mode } from "../data/contract";
import { fr, modeLabel } from "../i18n/fr";
import type { ModeVisibility } from "../state/app-state";
import { MODE_COLORS } from "../theme/colors";

export interface Filters {
  update(modes: ModeVisibility): void;
}

/** One checkbox per mode, named: colour is never the only carrier of meaning (SCOPE.md, 4.5). */
export function createFilters(
  parent: HTMLElement,
  onToggle: (mode: Mode, visible: boolean) => void,
): Filters {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "filters";
  const legend = document.createElement("legend");
  legend.textContent = fr.filtersLabel;
  fieldset.append(legend);
  const boxes = new Map<Mode, HTMLInputElement>();
  for (const mode of MODES) {
    const label = document.createElement("label");
    label.className = "filters__mode";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = true;
    box.addEventListener("change", () => {
      onToggle(mode, box.checked);
    });
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.setAttribute("aria-hidden", "true");
    const [r, g, b] = MODE_COLORS[mode];
    swatch.style.backgroundColor = `rgb(${String(r)} ${String(g)} ${String(b)})`;
    label.append(box, swatch, document.createTextNode(modeLabel(mode)));
    fieldset.append(label);
    boxes.set(mode, box);
  }
  parent.append(fieldset);
  return {
    update(modes) {
      for (const [mode, box] of boxes) {
        box.checked = modes[mode];
      }
    },
  };
}
