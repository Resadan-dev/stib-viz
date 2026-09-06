// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { fr } from "../../src/i18n/fr";
import { createColourToggle, createNetworkToggle } from "../../src/ui/colours";

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

describe("createNetworkToggle", () => {
  it("is a pressed-state button that swaps the network between its runs and its speeds", () => {
    const parent = document.body.appendChild(document.createElement("div"));
    const onChange = vi.fn();
    const toggle = createNetworkToggle(parent, onChange);
    const button = parent.querySelector("button");
    expect(button?.textContent).toBe(fr.networkSpeeds);
    toggle.update("runs");
    expect(button?.getAttribute("aria-pressed")).toBe("false");
    button?.click();
    expect(onChange).toHaveBeenCalledWith("speed");
    toggle.update("speed");
    expect(button?.getAttribute("aria-pressed")).toBe("true");
    button?.click();
    expect(onChange).toHaveBeenLastCalledWith("runs");
  });
});
