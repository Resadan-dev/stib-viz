// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { fr } from "../../src/i18n/fr";
import { createPlayButton } from "../../src/ui/controls";
import { bindKeyboard, type KeyboardHandlers } from "../../src/ui/keyboard";
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
  let unbind: () => void = () => undefined;
  afterEach(() => {
    unbind();
    document.body.replaceChildren();
  });

  function handlers(): KeyboardHandlers {
    return { toggle: vi.fn(), step: vi.fn(), setSpeed: vi.fn(), escape: vi.fn() };
  }

  function press(key: string, options: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...options,
    });
    document.body.dispatchEvent(event);
    return event;
  }

  it("toggles playback on the space bar and prevents the page from scrolling", () => {
    const h = handlers();
    unbind = bindKeyboard(document, h);
    const event = press(" ");
    expect(h.toggle).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    unbind();
    press(" ");
    expect(h.toggle).toHaveBeenCalledTimes(1);
  });

  it("steps one minute with the arrows, ten with Shift", () => {
    const h = handlers();
    unbind = bindKeyboard(document, h);
    press("ArrowRight");
    press("ArrowLeft");
    press("ArrowRight", { shiftKey: true });
    press("ArrowLeft", { shiftKey: true });
    expect(vi.mocked(h.step).mock.calls.map((call) => call[0])).toEqual([60, -60, 600, -600]);
  });

  it("picks a speed with the digits 1 to 4 and escapes with Escape", () => {
    const h = handlers();
    unbind = bindKeyboard(document, h);
    for (const key of ["1", "2", "3", "4", "5"]) {
      press(key);
    }
    expect(vi.mocked(h.setSpeed).mock.calls.map((call) => call[0])).toEqual([60, 120, 300, 600]);
    press("Escape");
    expect(h.escape).toHaveBeenCalledTimes(1);
  });

  it("leaves buttons and inputs to their native behaviour", () => {
    const h = handlers();
    unbind = bindKeyboard(document, h);
    const button = document.createElement("button");
    document.body.append(button);
    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }),
    );
    const input = document.createElement("input");
    document.body.append(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    press("x");
    expect(h.toggle).not.toHaveBeenCalled();
    expect(h.step).not.toHaveBeenCalled();
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
