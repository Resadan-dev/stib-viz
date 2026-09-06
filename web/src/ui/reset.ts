import { fr } from "../i18n/fr";

/**
 * A quiet button beside the clock that winds the day back to its first instant, 04:00. Playback
 * carries on: the button rewinds the day, it does not stop it.
 */
export function createResetButton(parent: HTMLElement, onReset: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "reset";
  button.textContent = fr.reset;
  button.title = fr.resetHint;
  button.addEventListener("click", onReset);
  parent.append(button);
  return button;
}
