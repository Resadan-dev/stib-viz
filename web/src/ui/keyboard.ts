import { SPEEDS } from "../time/player";

export interface KeyboardHandlers {
  toggle: () => void;
  /** Signed number of service seconds. */
  step: (seconds: number) => void;
  setSpeed: (speed: number) => void;
  escape: () => void;
}

/** Fields and selects own every key; buttons and links only own Space and Enter. */
const OWNS_EVERY_KEY = new Set(["INPUT", "SELECT", "TEXTAREA"]);
const OWNS_ACTIVATION = new Set(["BUTTON", "A"]);
const MINUTE_S = 60;

/**
 * Space plays and pauses; arrows step one minute, ten with Shift; one digit per speed;
 * Escape clears the selection (ARCHITECTURE.md, section 6.6). Fields keep every key; a focused
 * button keeps Space so it is not toggled twice, but arrows and digits still drive playback.
 *
 * An open dialog keeps them all: Escape closes it on its own, and should do nothing else. Only
 * the dialogs inside `scope` count, the page's own in practice, so a dialog that another script
 * adds to the document cannot silence the page. The whole scope is searched rather than around
 * the target, because a click on the text of a dialog can leave the focus on the page itself.
 */
export function bindKeyboard(
  target: EventTarget,
  handlers: KeyboardHandlers,
  scope: ParentNode = document,
): () => void {
  const onKeyDown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent) || scope.querySelector("dialog[open]") !== null) {
      return;
    }
    const tag = event.target instanceof Element ? event.target.tagName : "";
    if (OWNS_EVERY_KEY.has(tag) || (OWNS_ACTIVATION.has(tag) && event.key === " ")) {
      return;
    }
    const minutes = event.shiftKey ? 10 : 1;
    switch (event.key) {
      case " ":
        event.preventDefault();
        handlers.toggle();
        return;
      case "ArrowRight":
        event.preventDefault();
        handlers.step(minutes * MINUTE_S);
        return;
      case "ArrowLeft":
        event.preventDefault();
        handlers.step(-minutes * MINUTE_S);
        return;
      case "Escape":
        handlers.escape();
        return;
      default: {
        const rank = Number(event.key);
        const speed = SPEEDS[rank - 1];
        if (Number.isInteger(rank) && rank >= 1 && speed !== undefined) {
          handlers.setSpeed(speed);
        }
      }
    }
  };
  target.addEventListener("keydown", onKeyDown);
  return () => {
    target.removeEventListener("keydown", onKeyDown);
  };
}
