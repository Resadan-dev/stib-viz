// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { fr } from "../../src/i18n/fr";
import { createPlayButton } from "../../src/ui/controls";
import { bindKeyboard } from "../../src/ui/keyboard";
import { createStatusView } from "../../src/ui/status";

describe("createPlayButton", () => {
  it("labels the action to come and calls back on click", () => {
    const parent = document.createElement("div");
    const onToggle = vi.fn();
    const button = createPlayButton(parent, onToggle);
    button.update(false);
    const element = parent.querySelector("button");
    expect(element?.textContent).toBe(fr.play);
    expect(element?.getAttribute("type")).toBe("button");
    button.update(true);
    expect(element?.textContent).toBe(fr.pause);
    element?.click();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe("bindKeyboard", () => {
  it("toggles playback on the space bar outside interactive elements", () => {
    const toggle = vi.fn();
    const unbind = bindKeyboard(document, { toggle });
    const event = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    unbind();
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("leaves buttons and inputs to their native behaviour", () => {
    const toggle = vi.fn();
    const unbind = bindKeyboard(document, { toggle });
    const button = document.createElement("button");
    document.body.append(button);
    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }),
    );
    expect(toggle).not.toHaveBeenCalled();
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
    expect(toggle).not.toHaveBeenCalled();
    unbind();
  });
});

describe("createStatusView", () => {
  it("announces a message and hides it again", () => {
    const parent = document.createElement("div");
    const status = createStatusView(parent);
    const element = parent.querySelector<HTMLElement>("[role=status]");
    expect(element?.hidden).toBe(true);
    status.show(fr.waitingNextHour);
    expect(element?.hidden).toBe(false);
    expect(element?.textContent).toBe(fr.waitingNextHour);
    status.hide();
    expect(element?.hidden).toBe(true);
  });
});
