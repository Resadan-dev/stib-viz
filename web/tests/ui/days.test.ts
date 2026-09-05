// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { fr } from "../../src/i18n/fr";
import { createDaySelector, dayChipLabel } from "../../src/ui/days";
import { INDEX } from "../helpers/fixtures";

describe("dayChipLabel", () => {
  it("shows the short weekday and the day of the month in French", () => {
    expect(dayChipLabel("2026-09-09")).toBe("mer. 9");
    expect(dayChipLabel("2026-09-12")).toBe("sam. 12");
  });
});

describe("createDaySelector", () => {
  it("offers one pressed-state button per day and reports the choice", () => {
    const parent = document.body.appendChild(document.createElement("div"));
    const onSelect = vi.fn();
    const selector = createDaySelector(parent, INDEX.days, onSelect);
    const group = parent.querySelector("[role=group]");
    expect(group?.getAttribute("aria-label")).toBe(fr.daysLabel);
    const buttons = parent.querySelectorAll("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.textContent).toBe("mer. 9");
    expect(buttons[1]?.getAttribute("title")).toContain("11 septembre 2026");
    selector.update("2026-09-11");
    expect(buttons[0]?.getAttribute("aria-pressed")).toBe("false");
    expect(buttons[1]?.getAttribute("aria-pressed")).toBe("true");
    buttons[0]?.click();
    expect(onSelect).toHaveBeenCalledWith("2026-09-09");
    buttons[1]?.click();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
