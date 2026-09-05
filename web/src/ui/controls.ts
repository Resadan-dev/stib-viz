import { fr } from "../i18n/fr";

export interface PlayButton {
  element: HTMLButtonElement;
  update(playing: boolean): void;
}

/** One button whose label names the action to come: "Lecture" while paused, "Pause" while playing. */
export function createPlayButton(parent: HTMLElement, onToggle: () => void): PlayButton {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "play";
  button.textContent = fr.play;
  button.addEventListener("click", onToggle);
  parent.append(button);
  let shown = false;
  return {
    element: button,
    update(playing) {
      if (playing !== shown) {
        shown = playing;
        button.textContent = playing ? fr.pause : fr.play;
      }
    },
  };
}
