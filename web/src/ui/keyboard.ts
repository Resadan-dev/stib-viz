import { SPEEDS } from "../time/player";

export interface KeyboardHandlers {
  toggle: () => void;
  /** Signed number of service seconds. */
  step: (seconds: number) => void;
  setSpeed: (speed: number) => void;
  escape: () => void;
}

const INTERACTIVE = new Set(["BUTTON", "INPUT", "SELECT", "TEXTAREA", "A"]);
const MINUTE_S = 60;

/**
 * Space plays and pauses; arrows step one minute, ten with Shift; digits 1 to 4 pick a speed;
 * Escape clears the selection (ARCHITECTURE.md, section 6.6). Interactive elements keep their
 * native behaviour, so a focused button is not toggled twice.
 */
export function bindKeyboard(target: EventTarget, handlers: KeyboardHandlers): () => void {
  const onKeyDown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent)) {
      return;
    }
    if (event.target instanceof Element && INTERACTIVE.has(event.target.tagName)) {
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
