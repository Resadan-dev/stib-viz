// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { fr } from "../../src/i18n/fr";
import { createColourToggle, createNetworkViews } from "../../src/ui/colours";

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

describe("createNetworkViews", () => {
  function mount() {
    const parent = document.body.appendChild(document.createElement("div"));
    const onChange = vi.fn();
    const views = createNetworkViews(parent, onChange);
    const buttons = [...parent.querySelectorAll("button")];
    return { parent, onChange, views, buttons };
  }

  it("offers the three readings of the network, named and grouped", () => {
    const { parent, buttons } = mount();
    expect(buttons.map((button) => button.textContent)).toEqual([
      fr.networkRuns,
      fr.networkSpeed,
      fr.networkDeviation,
    ]);
    expect(parent.querySelector("[role=group]")?.getAttribute("aria-label")).toBe(fr.networkLabel);
    expect(parent.querySelector(".views__label")?.textContent).toBe(fr.networkLabel);
    expect(buttons.every((button) => button.type === "button")).toBe(true);
  });

  it("presses the one in use and reports the one asked for", () => {
    const { onChange, views, buttons } = mount();
    views.update("runs");
    expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual([
      "true",
      "false",
      "false",
    ]);
    buttons[2]?.click();
    expect(onChange).toHaveBeenCalledWith("relative");
    views.update("relative");
    expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual([
      "false",
      "false",
      "true",
    ]);
    buttons[1]?.click();
    expect(onChange).toHaveBeenLastCalledWith("speed");
  });
});
