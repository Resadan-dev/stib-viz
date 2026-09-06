// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { fr } from "../../src/i18n/fr";
import { SPEEDS } from "../../src/time/player";
import { createSpeedControl } from "../../src/ui/speed";

describe("createSpeedControl", () => {
  it("offers the four speeds as a labelled group and reports the choice", () => {
    const parent = document.createElement("div");
    const onSelect = vi.fn();
    const control = createSpeedControl(parent, onSelect);
    const group = parent.querySelector("[role=group]");
    expect(group?.getAttribute("aria-label")).toBe(fr.speedLabel);
    const buttons = parent.querySelectorAll("button");
    expect(buttons).toHaveLength(SPEEDS.length);
    expect(buttons[4]?.textContent).toBe("×1200");
    buttons[4]?.click();
    expect(onSelect).toHaveBeenCalledWith(1200);
    control.update(1200);
    expect(buttons[4]?.getAttribute("aria-pressed")).toBe("true");
    expect(buttons[3]?.getAttribute("aria-pressed")).toBe("false");
  });
});
