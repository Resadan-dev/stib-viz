// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { fr } from "../../src/i18n/fr";
import { createResetButton } from "../../src/ui/reset";

describe("createResetButton", () => {
  it("names the action, explains it in a title and reports the click", () => {
    const parent = document.createElement("div");
    const onReset = vi.fn();
    createResetButton(parent, onReset);
    const button = parent.querySelector("button");
    expect(button?.type).toBe("button");
    expect(button?.textContent).toBe(fr.reset);
    expect(button?.title).toBe(fr.resetHint);
    button?.click();
    button?.click();
    expect(onReset).toHaveBeenCalledTimes(2);
  });

  // WCAG 2.2, 2.5.3: the title becomes the accessible name in some readings, so it has to carry
  // the visible label rather than replace it.
  it("keeps the visible label inside the hint", () => {
    expect(fr.resetHint).toContain(fr.reset);
  });
});
