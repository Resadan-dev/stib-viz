// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { fr } from "../../src/i18n/fr";
import { allModes } from "../../src/state/app-state";
import { createFilters } from "../../src/ui/filters";

describe("createFilters", () => {
  it("offers one named checkbox per mode and reports changes", () => {
    // Checkbox activation only fires change events on elements connected to the document.
    const parent = document.body.appendChild(document.createElement("div"));
    const onToggle = vi.fn();
    const filters = createFilters(parent, onToggle);
    expect(parent.querySelector("legend")?.textContent).toBe(fr.filtersLabel);
    const boxes = parent.querySelectorAll<HTMLInputElement>("input[type=checkbox]");
    expect(boxes).toHaveLength(4);
    expect(parent.querySelectorAll("label")[2]?.textContent).toContain(fr.modeBus);
    filters.update(allModes(true));
    expect([...boxes].every((box) => box.checked)).toBe(true);
    const bus = boxes[2];
    if (bus === undefined) {
      throw new Error("no bus checkbox");
    }
    bus.click();
    expect(onToggle).toHaveBeenCalledWith("bus", false);
    filters.update({ ...allModes(true), bus: false });
    expect(bus.checked).toBe(false);
  });
});
