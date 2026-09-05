import { fr } from "../i18n/fr";
import { SPEEDS } from "../time/player";

export interface SpeedControl {
  update(speed: number): void;
}

/** Four toggle buttons, ×60 to ×600; the pressed one is the current speed. */
export function createSpeedControl(
  parent: HTMLElement,
  onSelect: (speed: number) => void,
): SpeedControl {
  const group = document.createElement("div");
  group.className = "speeds";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", fr.speedLabel);
  const buttons = new Map<number, HTMLButtonElement>();
  for (const speed of SPEEDS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "speeds__button";
    button.textContent = `×${String(speed)}`;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      onSelect(speed);
    });
    buttons.set(speed, button);
    group.append(button);
  }
  parent.append(group);
  return {
    update(speed) {
      for (const [value, button] of buttons) {
        button.setAttribute("aria-pressed", value === speed ? "true" : "false");
      }
    },
  };
}
