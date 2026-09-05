export interface StatusView {
  show(message: string): void;
  hide(): void;
}

/** A polite live region for loading, waiting and error messages. */
export function createStatusView(parent: HTMLElement): StatusView {
  const element = document.createElement("p");
  element.className = "status";
  element.setAttribute("role", "status");
  element.setAttribute("aria-live", "polite");
  element.hidden = true;
  parent.append(element);
  return {
    show(message) {
      element.textContent = message;
      element.hidden = false;
    },
    hide() {
      element.hidden = true;
    },
  };
}
