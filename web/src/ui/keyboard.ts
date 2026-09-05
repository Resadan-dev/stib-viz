export interface KeyboardHandlers {
  toggle: () => void;
}

const INTERACTIVE = new Set(["BUTTON", "INPUT", "SELECT", "TEXTAREA", "A"]);

/**
 * Space plays and pauses (ARCHITECTURE.md, section 6.6). Interactive elements keep their native
 * behaviour, so a focused button is not toggled twice.
 */
export function bindKeyboard(target: EventTarget, handlers: KeyboardHandlers): () => void {
  const onKeyDown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent)) {
      return;
    }
    if (event.target instanceof Element && INTERACTIVE.has(event.target.tagName)) {
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      handlers.toggle();
    }
  };
  target.addEventListener("keydown", onKeyDown);
  return () => {
    target.removeEventListener("keydown", onKeyDown);
  };
}
