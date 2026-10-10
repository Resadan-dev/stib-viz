import { fr } from "../i18n/fr";
import { NETWORK_VIEWS, type ColourScheme, type NetworkView } from "../state/app-state";

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

export interface NetworkToggle {
  update(view: NetworkView): void;
}

/**
 * The readings of the network layer, as one group of pressed-state buttons: how often it is run,
 * how fast the timetable is over it at this hour, how far that hour is from the habit of the
 * segment itself, and how well it serves the residents. A day without coverage offers no button
 * for it, which is why the views are given.
 */
export function createNetworkViews(
  parent: HTMLElement,
  onChange: (view: NetworkView) => void,
  views: readonly NetworkView[] = NETWORK_VIEWS,
): NetworkToggle {
  const wrapper = document.createElement("div");
  wrapper.className = "views";
  const label = document.createElement("span");
  label.className = "views__label";
  label.textContent = fr.networkLabel;
  const group = document.createElement("div");
  group.className = "views__group";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", fr.networkLabel);
  const wording: Record<NetworkView, string> = {
    runs: fr.networkRuns,
    speed: fr.networkSpeed,
    relative: fr.networkDeviation,
    coverage: fr.networkCoverage,
  };
  const buttons = new Map<NetworkView, HTMLButtonElement>();
  for (const view of views) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "views__button";
    button.textContent = wording[view];
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      onChange(view);
    });
    group.append(button);
    buttons.set(view, button);
  }
  wrapper.append(label, group);
  parent.append(wrapper);
  return {
    update(view) {
      for (const [candidate, button] of buttons) {
        button.setAttribute("aria-pressed", candidate === view ? "true" : "false");
      }
    },
  };
}
