import { fr, stepperLabel, vehicleRank, vehicleTally } from "../i18n/fr";

export interface StepperState {
  /** The selected line, or null when no line is selected and the stepper has nothing to walk. */
  line: string | null;
  /** 1-based position of the selected vehicle among those of the line, or null. */
  position: number | null;
  total: number;
}

export interface VehicleStepper {
  update(state: StepperState): void;
}

function stepButton(label: string, text: string, arrow: string, after: boolean): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "stepper__button";
  button.setAttribute("aria-label", label);
  const glyph = document.createElement("span");
  glyph.className = "stepper__arrow";
  glyph.setAttribute("aria-hidden", "true");
  glyph.textContent = arrow;
  const words = document.createTextNode(text);
  button.append(...(after ? [words, glyph] : [glyph, words]));
  return button;
}

/**
 * Previous and next buttons that walk through the vehicles of the selected line, for people who
 * find the dots too small to click (SCOPE.md, section 4.4). It lives in the line picker, under
 * the badges, and appears only once a line is chosen: named in words, with the line it belongs
 * to and how many of its vehicles are running written out rather than left as a fraction.
 */
export function createVehicleStepper(
  parent: HTMLElement,
  onStep: (direction: 1 | -1) => void,
): VehicleStepper {
  const group = document.createElement("div");
  group.className = "stepper";
  group.setAttribute("role", "group");
  group.setAttribute("aria-labelledby", "vehicle-stepper-label");
  group.hidden = true;

  const label = document.createElement("p");
  label.className = "stepper__label";
  label.id = "vehicle-stepper-label";

  const row = document.createElement("div");
  row.className = "stepper__row";
  const previous = stepButton(fr.previousVehicle, fr.previous, "◀", false);
  const count = document.createElement("span");
  count.className = "stepper__count";
  // No live region here on purpose: the total shifts every few seconds as vehicles enter and
  // leave service, and the vehicle panel already announces the selection when it changes.
  const next = stepButton(fr.nextVehicle, fr.next, "▶", true);
  previous.addEventListener("click", () => {
    onStep(-1);
  });
  next.addEventListener("click", () => {
    onStep(1);
  });
  row.append(previous, count, next);
  group.append(label, row);
  parent.append(group);

  let shown = "";
  return {
    update(state) {
      const key = `${state.line ?? ""}|${String(state.position)}|${String(state.total)}`;
      if (key === shown) {
        return;
      }
      shown = key;
      group.hidden = state.line === null;
      if (state.line === null) {
        return;
      }
      label.textContent = stepperLabel(state.line);
      count.textContent =
        state.position === null
          ? vehicleTally(state.total)
          : vehicleRank(state.position, state.total);
      previous.disabled = state.total === 0;
      next.disabled = state.total === 0;
    },
  };
}
