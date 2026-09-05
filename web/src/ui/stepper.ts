import { fr } from "../i18n/fr";

export interface StepperState {
  enabled: boolean;
  /** 1-based position of the selected vehicle among those of the line, or null. */
  position: number | null;
  total: number;
}

export interface VehicleStepper {
  update(state: StepperState): void;
}

/**
 * Previous and next buttons that walk through the vehicles of the selected line, for people who
 * find the dots too small to click (SCOPE.md, section 4.4).
 */
export function createVehicleStepper(
  parent: HTMLElement,
  onStep: (direction: 1 | -1) => void,
): VehicleStepper {
  const group = document.createElement("div");
  group.className = "stepper";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", fr.stepperLabel);
  const previous = document.createElement("button");
  previous.type = "button";
  previous.className = "stepper__button";
  previous.setAttribute("aria-label", fr.previousVehicle);
  previous.textContent = "◀";
  const count = document.createElement("span");
  count.className = "stepper__count";
  count.textContent = "– / 0";
  const next = document.createElement("button");
  next.type = "button";
  next.className = "stepper__button";
  next.setAttribute("aria-label", fr.nextVehicle);
  next.textContent = "▶";
  previous.addEventListener("click", () => {
    onStep(-1);
  });
  next.addEventListener("click", () => {
    onStep(1);
  });
  group.append(previous, count, next);
  parent.append(group);

  let shown = "";
  return {
    update(state) {
      const text = `${state.position === null ? "–" : String(state.position)} / ${String(state.total)}`;
      const key = `${String(state.enabled)}|${text}`;
      if (key === shown) {
        return;
      }
      shown = key;
      previous.disabled = !state.enabled;
      next.disabled = !state.enabled;
      count.textContent = text;
    },
  };
}
