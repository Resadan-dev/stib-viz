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
 * Space plays and pauses; arrows step one minute, ten with Shift; digits 1 to 4 pick a speed;
 * Escape clears the selection (ARCHITECTURE.md, section 6.6). Fields keep every key; a focused
 * button keeps Space so it is not toggled twice, but arrows and digits still drive playback.
 */
export function bindKeyboard(target: EventTarget, handlers: KeyboardHandlers): () => void {
  const onKeyDown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent)) {
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
        const speed = SPEEDS[Number(event.key) - 1];
        if (/^[1-4]$/.test(event.key) && speed !== undefined) {
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
