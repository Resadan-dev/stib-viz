// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { fr } from "../../src/i18n/fr";
import { createColourToggle } from "../../src/ui/colours";

describe("createColourToggle", () => {
  it("is a pressed-state button that reports the scheme to use", () => {
    const parent = document.body.appendChild(document.createElement("div"));
    const onChange = vi.fn();
    const toggle = createColourToggle(parent, onChange);
    const button = parent.querySelector("button");
    expect(button?.textContent).toBe(fr.officialColours);
    toggle.update("palette");
    expect(button?.getAttribute("aria-pressed")).toBe("false");
    button?.click();
    expect(onChange).toHaveBeenCalledWith("official");
    toggle.update("official");
    expect(button?.getAttribute("aria-pressed")).toBe("true");
    button?.click();
    expect(onChange).toHaveBeenLastCalledWith("palette");
  });
});
