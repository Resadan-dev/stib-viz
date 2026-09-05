import { fr } from "../i18n/fr";
import type { ColourScheme } from "../state/app-state";

export interface ColourToggle {
  update(scheme: ColourScheme): void;
}

/** One pressed-state button: pressed means every route wears its official STIB colour. */
export function createColourToggle(
  parent: HTMLElement,
  onChange: (scheme: ColourScheme) => void,
): ColourToggle {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "toggle";
  button.textContent = fr.officialColours;
  button.setAttribute("aria-pressed", "false");
  let shown: ColourScheme = "palette";
  button.addEventListener("click", () => {
    onChange(shown === "official" ? "palette" : "official");
  });
  parent.append(button);
  return {
    update(scheme) {
      shown = scheme;
      button.setAttribute("aria-pressed", scheme === "official" ? "true" : "false");
    },
  };
}
